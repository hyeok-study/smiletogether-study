import http from 'k6/http';
import { check, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { selectedProfile } from './lib/profiles.js';

const profile = selectedProfile(__ENV);
const historySuccess = new Rate('history_read_success');
const historyLatency = new Trend('history_read_latency_ms', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    history: {
      executor: 'constant-arrival-rate',
      rate: profile.messageRate,
      timeUnit: '1s',
      duration: profile.duration,
      preAllocatedVUs: profile.vus,
      maxVUs: profile.vus * 2,
    },
  },
  thresholds: {
    history_read_success: ['rate>0.99'],
    history_read_latency_ms: [`p(95)<${__ENV.P95_LATENCY_THRESHOLD_MS || 1000}`],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  if (!__ENV.ACCESS_TOKEN) {
    fail('ACCESS_TOKEN is required for the history API.');
  }
}

export default function () {
  const baseUrl = __ENV.HISTORY_BASE_URL || 'http://localhost:8083';
  const workspaceId = __ENV.WORKSPACE_ID || '24fa7058-fb3a-11ef-a453-6640c3b0a700';
  const channelId = __ENV.CHANNEL_ID || '24faa8dc-fb3a-11ef-a453-6640c3b0a705';
  const token = __ENV.ACCESS_TOKEN.startsWith('Bearer ')
    ? __ENV.ACCESS_TOKEN
    : `Bearer ${__ENV.ACCESS_TOKEN}`;
  const lastTimeStamp = __ENV.LAST_TIMESTAMP || localDateTime();
  const url = `${baseUrl}/api/workspaces/${workspaceId}/channels/${channelId}/messages?lastTimeStamp=${encodeURIComponent(lastTimeStamp)}`;

  const response = http.get(url, {
    headers: { Authorization: token },
    tags: { endpoint: 'history_messages' },
  });
  const success = check(response, {
    'history responds 200': res => res.status === 200,
    'history response is JSON': res => (res.headers['Content-Type'] || '').includes('application/json'),
  });

  historySuccess.add(success);
  historyLatency.add(response.timings.duration);
}

function localDateTime() {
  const koreaTime = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${koreaTime.toISOString().slice(0, -1)}000`;
}

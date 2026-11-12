import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const notificationSuccess = new Rate('notification_subscription_success');
const notificationLatency = new Trend('notification_subscription_latency_ms', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    subscription: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 5),
      iterations: Number(__ENV.ITERATIONS || 20),
      maxDuration: __ENV.MAX_DURATION || '30s',
    },
  },
  thresholds: {
    notification_subscription_success: ['rate>0.99'],
    notification_subscription_latency_ms: [`p(95)<${__ENV.P95_LATENCY_THRESHOLD_MS || 1000}`],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const baseUrl = __ENV.NOTIFICATION_BASE_URL || 'http://localhost:8087';
  const userId = __ENV.USER_ID || '24fa8a1c-fb3a-11ef-a453-6640c3b0a701';
  const uniqueToken = `load-test-${__ENV.TEST_RUN_ID || 'manual'}-${__VU}-${__ITER}`;
  const payload = JSON.stringify({
    userId,
    token: uniqueToken,
    expiredAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const response = http.post(`${baseUrl}/api/notification/subscribe-info`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'notification_subscribe' },
  });
  const success = check(response, {
    'notification subscription responds 200': res => res.status === 200,
    'notification subscription has success code': res => {
      try {
        return JSON.parse(res.body).code === '200';
      } catch (_) {
        return false;
      }
    },
  });

  notificationSuccess.add(success);
  notificationLatency.add(response.timings.duration);
}

import { fail } from 'k6';
import encoding from 'k6/encoding';
import ws from 'k6/ws';
import { Counter, Rate, Trend } from 'k6/metrics';
import { durationToMilliseconds, selectedProfile } from './lib/profiles.js';
import { frame, jsonBody, parseFrames } from './lib/stomp.js';

const profile = selectedProfile(__ENV);
const testDurationMs = durationToMilliseconds(profile.duration);
const deliveryThreshold = __ENV.DELIVERY_RATE_THRESHOLD || '0.99';
const latencyThreshold = __ENV.P95_LATENCY_THRESHOLD_MS || '2000';

const wsConnectSuccess = new Rate('ws_connect_success');
const wsErrors = new Counter('ws_errors');
const messagesSent = new Counter('chat_messages_sent');
const messagesReceived = new Counter('chat_messages_received');
const messageDeliverySuccess = new Rate('message_delivery_success');
const duplicateMessages = new Counter('duplicate_messages');
const outOfOrderMessages = new Counter('out_of_order_messages');
const messageRoundTrip = new Trend('message_round_trip_ms', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    chat: {
      executor: 'per-vu-iterations',
      vus: profile.vus,
      iterations: 1,
      maxDuration: profile.maxDuration,
    },
  },
  thresholds: {
    ws_connect_success: ['rate>0.99'],
    message_delivery_success: [`rate>${deliveryThreshold}`],
    duplicate_messages: ['count==0'],
    out_of_order_messages: ['count==0'],
    message_round_trip_ms: [`p(95)<${latencyThreshold}`],
  },
};

export function setup() {
  if (!__ENV.ACCESS_TOKEN && __ENV.ALLOW_SYNTHETIC_TOKEN !== 'true') {
    fail('ACCESS_TOKEN is required. For isolated local chat tests only, set ALLOW_SYNTHETIC_TOKEN=true.');
  }

  return {
    runId: __ENV.TEST_RUN_ID || `st-${Date.now()}`,
  };
}

export default function (data) {
  const wsUrl = __ENV.WS_URL || 'ws://localhost:8081/ws';
  const workspaceId = __ENV.WORKSPACE_ID || '24fa7058-fb3a-11ef-a453-6640c3b0a700';
  const channelId = __ENV.CHANNEL_ID || '24faa8dc-fb3a-11ef-a453-6640c3b0a705';
  const userId = __ENV.USER_ID || '24fa8a1c-fb3a-11ef-a453-6640c3b0a701';
  const token = normalizedToken(__ENV.ACCESS_TOKEN || syntheticToken(userId));
  const subscription = `/sub/workspaces/${workspaceId}/channels/${channelId}`;
  const destination = `/pub/workspaces/${workspaceId}/channels/${channelId}`;
  const pending = {};
  const received = {};
  let connected = false;
  let sentCount = 0;
  let lastReceivedSequence = 0;
  let deliveryFinalized = false;

  const response = ws.connect(wsUrl, { tags: { profile: profile.name } }, socket => {
    socket.on('open', () => {
      socket.send(frame('CONNECT', {
        'accept-version': '1.2',
        'heart-beat': '0,0',
        Authorization: token,
      }));
    });

    socket.on('message', rawData => {
      for (const stompFrame of parseFrames(rawData)) {
        if (stompFrame.command === 'CONNECTED') {
          connected = true;
          wsConnectSuccess.add(true);
          socket.send(frame('SUBSCRIBE', {
            id: `sub-${__VU}`,
            destination: subscription,
            ack: 'auto',
            Authorization: token,
          }));

          const usableDuration = Math.max(testDurationMs - 5000, 1000);
          const sendInterval = Math.max(Math.floor(usableDuration / profile.messagesPerVu), 10);
          const initialJitter = (__VU * 37) % Math.min(sendInterval, 1000);
          socket.setTimeout(() => {
            sentCount++;
            sendOne(socket, destination, token, data.runId, pending, sentCount);
            socket.setInterval(() => {
              if (sentCount < profile.messagesPerVu) {
                sentCount++;
                sendOne(socket, destination, token, data.runId, pending, sentCount);
              }
            }, sendInterval);
          }, initialJitter);
          continue;
        }

        if (stompFrame.command === 'ERROR') {
          wsErrors.add(1);
          continue;
        }

        if (stompFrame.command !== 'MESSAGE') {
          continue;
        }

        try {
          const payload = jsonBody(stompFrame);
          const marker = parseMarker(payload.content);
          if (!marker || marker.runId !== data.runId || marker.vu !== __VU) {
            continue;
          }

          if (received[marker.sequence]) {
            duplicateMessages.add(1);
            continue;
          }

          received[marker.sequence] = true;
          messagesReceived.add(1);
          messageDeliverySuccess.add(true);
          messageRoundTrip.add(Date.now() - marker.sentAt);
          delete pending[marker.sequence];

          if (marker.sequence < lastReceivedSequence) {
            outOfOrderMessages.add(1);
          }
          lastReceivedSequence = Math.max(lastReceivedSequence, marker.sequence);

          if (sentCount === profile.messagesPerVu && Object.keys(pending).length === 0) {
            socket.setTimeout(() => socket.close(), 500);
          }
        } catch (_) {
          wsErrors.add(1);
        }
      }
    });

    socket.on('error', () => {
      wsErrors.add(1);
      if (!connected) {
        wsConnectSuccess.add(false);
      }
    });

    socket.on('close', finalizeDelivery);
    socket.setTimeout(() => socket.close(), testDurationMs);

    function finalizeDelivery() {
      if (deliveryFinalized) return;
      deliveryFinalized = true;

      if (!connected) {
        wsConnectSuccess.add(false);
        messageDeliverySuccess.add(false);
      }
      for (const sequence of Object.keys(pending)) {
        if (!received[sequence]) {
          messageDeliverySuccess.add(false);
        }
      }
    }
  });

  if (!response || response.status !== 101) {
    wsConnectSuccess.add(false);
    messageDeliverySuccess.add(false);
  }
}

function sendOne(socket, destination, token, runId, pending, sequence) {
  const sentAt = Date.now();
  const marker = `[st:${runId}][vu:${__VU}][seq:${sequence}][sentAt:${sentAt}]`;
  const messageSize = Number(__ENV.MESSAGE_SIZE || 200);
  const padding = 'x'.repeat(Math.max(messageSize - marker.length - 1, 0));
  const body = JSON.stringify({ type: 'SEND', content: `${marker} ${padding}` });

  pending[sequence] = sentAt;
  socket.send(frame('SEND', {
    destination,
    'content-type': 'application/json',
    'content-length': String(body.length),
    Authorization: token,
  }, body));
  messagesSent.add(1);
}

function parseMarker(content) {
  if (typeof content !== 'string') return null;
  const match = /^\[st:([^\]]+)]\[vu:(\d+)]\[seq:(\d+)]\[sentAt:(\d+)]/.exec(content);
  if (!match) return null;
  return {
    runId: match[1],
    vu: Number(match[2]),
    sequence: Number(match[3]),
    sentAt: Number(match[4]),
  };
}

function normalizedToken(token) {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function syntheticToken(userId) {
  const header = encoding.b64encode(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'rawurl');
  const payload = encoding.b64encode(JSON.stringify({ userId, sub: userId }), 'rawurl');
  return `${header}.${payload}.synthetic`;
}

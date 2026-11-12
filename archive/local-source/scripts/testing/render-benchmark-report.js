#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const [summaryPath, metadataPath, outputPath] = process.argv.slice(2);
if (!summaryPath || !metadataPath || !outputPath) {
  console.error('Usage: node scripts/testing/render-benchmark-report.js <summary.json> <metadata.json> <report.md>');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

function value(metricName, key) {
  const metric = summary.metrics?.[metricName];
  const normalizedKey = key === 'rate' ? 'value' : key;
  const raw = metric?.values?.[key] ?? metric?.[normalizedKey];
  return typeof raw === 'number' ? raw : null;
}

function format(raw, suffix = '') {
  if (raw === null) return '-';
  return `${Number(raw).toFixed(2)}${suffix}`;
}

const rows = [
  ['WebSocket 연결 성공률', value('ws_connect_success', 'rate'), 'rate', true],
  ['메시지 전달 성공률', value('message_delivery_success', 'rate'), 'rate', true],
  ['메시지 왕복 중앙값', hasSamples('chat_messages_received') ? value('message_round_trip_ms', 'med') : null, 'ms', false],
  ['메시지 왕복 p95', hasSamples('chat_messages_received') ? value('message_round_trip_ms', 'p(95)') : null, 'ms', false],
  ['메시지 왕복 p99', hasSamples('chat_messages_received') ? value('message_round_trip_ms', 'p(99)') : null, 'ms', false],
  ['송신 메시지', value('chat_messages_sent', 'count'), 'count', null],
  ['수신 메시지', value('chat_messages_received', 'count'), 'count', null],
  ['중복 메시지', value('duplicate_messages', 'count'), 'count', false],
  ['순서 오류', value('out_of_order_messages', 'count'), 'count', false],
  ['히스토리 성공률', value('history_read_success', 'rate'), 'rate', true],
  ['히스토리 p95', value('history_read_latency_ms', 'p(95)'), 'ms', false],
  ['알림 구독 성공률', value('notification_subscription_success', 'rate'), 'rate', true],
  ['알림 구독 p95', value('notification_subscription_latency_ms', 'p(95)'), 'ms', false],
].filter(row => row[1] !== null);

function hasSamples(counterName) {
  return (value(counterName, 'count') || 0) > 0;
}

const report = [
  '# SmileTogether 테스트 실행 보고서',
  '',
  `- 실행 ID: \`${metadata.testRunId || '-'}\``,
  `- 시나리오: \`${metadata.scenario || '-'}\``,
  `- 프로필: \`${metadata.profile || '-'}\``,
  `- 커밋: \`${metadata.git?.commit || '-'}\``,
  `- 브랜치: \`${metadata.git?.branch || '-'}\``,
  `- 작업 트리 변경: \`${metadata.git?.dirty ? '있음' : '없음'}\``,
  `- 실행 시각: \`${metadata.capturedAt}\``,
  '',
  '## 측정 결과',
  '',
  '| 지표 | 값 |',
  '|---|---:|',
  ...rows.map(([name, raw, unit]) => {
    if (unit === 'rate') return `| ${name} | ${format(raw * 100, '%')} |`;
    if (unit === 'ms') return `| ${name} | ${format(raw, ' ms')} |`;
    return `| ${name} | ${format(raw)} |`;
  }),
  '',
  '## 환경',
  '',
  `- OS: ${metadata.runtime?.platform || '-'}`,
  `- CPU: ${metadata.runtime?.cpuModel || '-'} (${metadata.runtime?.cpuCount || '-'} cores)`,
  `- 메모리: ${format((metadata.runtime?.totalMemoryBytes || 0) / 1024 / 1024 / 1024, ' GiB')}`,
  `- k6: ${metadata.runtime?.k6 || '-'}`,
  `- Docker: ${metadata.runtime?.docker || '-'}`,
  `- 메시지 크기: ${metadata.workload?.messageSize || '-'} bytes`,
  `- Synthetic token: ${metadata.workload?.syntheticToken ? 'yes' : 'no'}`,
  '',
  '원본 수치는 같은 디렉터리의 `summary.json`, 환경 정보는 `metadata.json`에서 확인한다.',
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, report);

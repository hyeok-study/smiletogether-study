#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath) {
  console.error('Usage: node scripts/testing/compare-results.js <before-summary.json> <after-summary.json> <report.md>');
  process.exit(1);
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

const definitions = [
  ['메시지 왕복 p95', 'message_round_trip_ms', 'p(95)', 'lower', 'ms'],
  ['메시지 왕복 p99', 'message_round_trip_ms', 'p(99)', 'lower', 'ms'],
  ['메시지 전달 성공률', 'message_delivery_success', 'rate', 'higher', '%'],
  ['WebSocket 연결 성공률', 'ws_connect_success', 'rate', 'higher', '%'],
  ['중복 메시지', 'duplicate_messages', 'count', 'lower', '건'],
  ['순서 오류', 'out_of_order_messages', 'count', 'lower', '건'],
  ['히스토리 p95', 'history_read_latency_ms', 'p(95)', 'lower', 'ms'],
  ['히스토리 성공률', 'history_read_success', 'rate', 'higher', '%'],
  ['알림 구독 p95', 'notification_subscription_latency_ms', 'p(95)', 'lower', 'ms'],
];

function metric(summary, name, key) {
  if (name === 'message_round_trip_ms' && !hasCounterSamples(summary, 'chat_messages_received')) {
    return null;
  }
  const item = summary.metrics?.[name];
  const normalizedKey = key === 'rate' ? 'value' : key;
  const raw = item?.values?.[key] ?? item?.[normalizedKey];
  return typeof raw === 'number' ? raw : null;
}

function hasCounterSamples(summary, name) {
  const item = summary.metrics?.[name];
  const count = item?.values?.count ?? item?.count;
  return typeof count === 'number' && count > 0;
}

function display(value, unit) {
  if (value === null) return '-';
  const normalized = unit === '%' ? value * 100 : value;
  return `${normalized.toFixed(2)} ${unit}`;
}

function change(beforeValue, afterValue, direction) {
  if (beforeValue === null || afterValue === null || beforeValue === 0) return { rate: null, verdict: '판단 불가' };
  const rawRate = ((afterValue - beforeValue) / Math.abs(beforeValue)) * 100;
  const improved = direction === 'lower' ? afterValue < beforeValue : afterValue > beforeValue;
  const equal = afterValue === beforeValue;
  return { rate: rawRate, verdict: equal ? '동일' : improved ? '개선' : '악화' };
}

const rows = definitions
  .map(([label, metricName, key, direction, unit]) => {
    const beforeValue = metric(before, metricName, key);
    const afterValue = metric(after, metricName, key);
    if (beforeValue === null && afterValue === null) return null;
    const comparison = change(beforeValue, afterValue, direction);
    return [label, display(beforeValue, unit), display(afterValue, unit), comparison.rate, comparison.verdict];
  })
  .filter(Boolean);

const report = [
  '# SmileTogether Before/After 비교',
  '',
  `- Before: \`${beforePath}\``,
  `- After: \`${afterPath}\``,
  '',
  '| 지표 | Before | After | 변화율 | 판정 |',
  '|---|---:|---:|---:|---|',
  ...rows.map(([label, beforeValue, afterValue, rate, verdict]) =>
    `| ${label} | ${beforeValue} | ${afterValue} | ${rate === null ? '-' : `${rate.toFixed(2)}%`} | ${verdict} |`
  ),
  '',
  '> 변화율과 판정은 같은 장비·데이터·프로필로 실행한 경우에만 유효하다.',
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, report);

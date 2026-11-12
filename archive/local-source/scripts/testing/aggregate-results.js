#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const [outputPath, ...runDirectories] = process.argv.slice(2);
if (!outputPath || runDirectories.length < 3) {
  console.error('Usage: node scripts/testing/aggregate-results.js <output.md> <run-dir-1> <run-dir-2> <run-dir-3> [...]');
  process.exit(1);
}

const runs = runDirectories.map(directory => ({
  directory,
  summary: JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8')),
  metadata: JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8')),
}));

const identity = metadata => JSON.stringify({
  commit: metadata.git?.commit,
  scenario: metadata.scenario,
  profile: metadata.profile,
  workload: metadata.workload,
});
const comparable = runs.every(run => identity(run.metadata) === identity(runs[0].metadata));

const definitions = [
  ['WebSocket 연결 성공률', 'ws_connect_success', 'rate', '%'],
  ['메시지 전달 성공률', 'message_delivery_success', 'rate', '%'],
  ['메시지 왕복 중앙값', 'message_round_trip_ms', 'med', 'ms'],
  ['메시지 왕복 p95', 'message_round_trip_ms', 'p(95)', 'ms'],
  ['메시지 왕복 p99', 'message_round_trip_ms', 'p(99)', 'ms'],
  ['송신 메시지', 'chat_messages_sent', 'count', '건'],
  ['수신 메시지', 'chat_messages_received', 'count', '건'],
  ['중복 메시지', 'duplicate_messages', 'count', '건'],
  ['순서 오류', 'out_of_order_messages', 'count', '건'],
];

function metric(summary, name, key) {
  const item = summary.metrics?.[name];
  const normalizedKey = key === 'rate' ? 'value' : key;
  const raw = item?.values?.[key] ?? item?.[normalizedKey];
  return typeof raw === 'number' ? raw : null;
}

function median(values) {
  const sorted = values.filter(value => value !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function display(value, unit) {
  if (value === null) return '-';
  return `${(unit === '%' ? value * 100 : value).toFixed(2)} ${unit}`;
}

const rows = definitions.map(([label, metricName, key, unit]) => {
  const values = runs.map(run => metric(run.summary, metricName, key));
  return [label, values, median(values), unit];
});

const metadata = runs[0].metadata;
const report = [
  '# SmileTogether 반복 실행 중앙값',
  '',
  `- 비교 가능 여부: **${comparable ? '가능' : '불가'}**`,
  `- 시나리오: \`${metadata.scenario}\``,
  `- 프로필: \`${metadata.profile}\``,
  `- 커밋: \`${metadata.git?.commit}\``,
  `- Synthetic token: \`${metadata.workload?.syntheticToken ? 'yes' : 'no'}\``,
  `- 반복 횟수: ${runs.length}`,
  '',
  '| 지표 | 실행값 | 중앙값 |',
  '|---|---|---:|',
  ...rows.map(([label, values, medianValue, unit]) =>
    `| ${label} | ${values.map(value => display(value, unit)).join(', ')} | ${display(medianValue, unit)} |`
  ),
  '',
  '## 원본 실행',
  '',
  ...runs.map(run => `- \`${run.directory}\``),
  '',
  comparable
    ? '> metadata의 핵심 비교 조건이 일치한다. 장비 부하와 외부 서비스 상태는 별도로 확인한다.'
    : '> 커밋·프로필·workload 중 하나 이상이 다르므로 이 중앙값을 근거로 사용하면 안 된다.',
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, report);

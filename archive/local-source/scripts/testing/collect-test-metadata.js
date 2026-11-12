#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Usage: node scripts/testing/collect-test-metadata.js <output.json>');
  process.exit(1);
}

function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.error) return null;
  return `${result.stdout || ''}${result.stderr || ''}`.trim() || null;
}

function dockerContainers(project) {
  const output = command('docker', [
    'ps',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{json .}}',
  ]);
  if (!output) return [];

  return output.split('\n').flatMap(line => {
    try {
      const container = JSON.parse(line);
      return [{ name: container.Names, image: container.Image, state: container.State, status: container.Status }];
    } catch (_) {
      return [];
    }
  });
}

const dockerProject = process.env.DOCKER_COMPOSE_PROJECT || 'config';

const metadata = {
  capturedAt: new Date().toISOString(),
  testRunId: process.env.TEST_RUN_ID || null,
  scenario: process.env.TEST_SCENARIO || null,
  profile: process.env.PROFILE || null,
  git: {
    commit: command('git', ['rev-parse', 'HEAD']),
    branch: command('git', ['branch', '--show-current']),
    dirty: Boolean(command('git', ['status', '--porcelain'])),
  },
  runtime: {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpuModel: os.cpus()[0]?.model || null,
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    java: command('java', ['-version']),
    node: command('node', ['--version']),
    k6: command('k6', ['version']),
    docker: command('docker', ['--version']),
    dockerCompose: command('docker', ['compose', 'version']),
    dockerProject,
    containers: dockerContainers(dockerProject),
  },
  workload: {
    wsUrl: process.env.WS_URL || 'ws://localhost:8081/ws',
    historyBaseUrl: process.env.HISTORY_BASE_URL || 'http://localhost:8083',
    notificationBaseUrl: process.env.NOTIFICATION_BASE_URL || 'http://localhost:8087',
    workspaceId: process.env.WORKSPACE_ID || '24fa7058-fb3a-11ef-a453-6640c3b0a700',
    channelId: process.env.CHANNEL_ID || '24faa8dc-fb3a-11ef-a453-6640c3b0a705',
    userId: process.env.USER_ID || '24fa8a1c-fb3a-11ef-a453-6640c3b0a701',
    messageSize: Number(process.env.MESSAGE_SIZE || 200),
    syntheticToken: process.env.ALLOW_SYNTHETIC_TOKEN === 'true',
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);

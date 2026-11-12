export function frame(command, headers = {}, body = '') {
  const headerLines = Object.entries(headers).map(([key, value]) => `${key}:${value}`);
  return `${command}\n${headerLines.join('\n')}\n\n${body}\u0000`;
}

export function parseFrames(rawData) {
  return String(rawData)
    .split('\u0000')
    .map(value => value.replace(/^\n+/, ''))
    .filter(value => value.trim().length > 0)
    .map(parseFrame);
}

function parseFrame(rawFrame) {
  const separatorIndex = rawFrame.indexOf('\n\n');
  const head = separatorIndex >= 0 ? rawFrame.slice(0, separatorIndex) : rawFrame;
  const body = separatorIndex >= 0 ? rawFrame.slice(separatorIndex + 2) : '';
  const lines = head.split('\n');
  const command = lines.shift().trim();
  const headers = {};

  for (const line of lines) {
    const delimiter = line.indexOf(':');
    if (delimiter > 0) {
      headers[line.slice(0, delimiter)] = line.slice(delimiter + 1);
    }
  }

  return { command, headers, body };
}

export function jsonBody(stompFrame) {
  let parsed = JSON.parse(stompFrame.body);
  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }
  return parsed;
}

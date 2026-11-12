export const PROFILES = {
  smoke: {
    vus: 5,
    duration: '20s',
    maxDuration: '30s',
    messagesPerVu: 5,
    messageRate: 1,
  },
  baseline: {
    vus: 20,
    duration: '40s',
    maxDuration: '55s',
    messagesPerVu: 10,
    messageRate: 5,
  },
  normal: {
    vus: 50,
    duration: '40s',
    maxDuration: '55s',
    messagesPerVu: 8,
    messageRate: 10,
  },
  high: {
    vus: 100,
    duration: '40s',
    maxDuration: '55s',
    messagesPerVu: 8,
    messageRate: 20,
  },
  stress: {
    vus: 300,
    duration: '60s',
    maxDuration: '80s',
    messagesPerVu: 10,
    messageRate: 50,
  },
  extreme: {
    vus: 1000,
    duration: '60s',
    maxDuration: '90s',
    messagesPerVu: 6,
    messageRate: 100,
  },
};

export function selectedProfile(env) {
  const name = env.PROFILE || 'smoke';
  const base = PROFILES[name];
  if (!base) {
    throw new Error(`Unknown PROFILE '${name}'. Use ${Object.keys(PROFILES).join(', ')}.`);
  }

  return {
    name,
    vus: Number(env.VUS || base.vus),
    duration: env.DURATION || base.duration,
    maxDuration: env.MAX_DURATION || base.maxDuration,
    messagesPerVu: Number(env.MESSAGES_PER_VU || base.messagesPerVu),
    messageRate: Number(env.REQUEST_RATE || base.messageRate),
  };
}

export function durationToMilliseconds(value) {
  const match = /^(\d+)(ms|s|m)$/.exec(value);
  if (!match) {
    throw new Error(`Unsupported duration '${value}'. Use ms, s, or m.`);
  }

  const amount = Number(match[1]);
  const multiplier = match[2] === 'm' ? 60000 : match[2] === 's' ? 1000 : 1;
  return amount * multiplier;
}

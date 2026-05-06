const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const DATA_DIR = path.join(__dirname, '../../data');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const ENV_PATH = path.join(__dirname, '../../.env');

const DEFAULT_SETTINGS = {
  wled: {
    ip: '192.168.1.100',
    port: 4048,
    brightness: 128,
  },
  matrix: {
    width: 16,
    height: 16,
  },
  display: {
    dithering: true,
    ditherAlgorithm: 'floyd-steinberg',
    pollingIntervalMs: 4000,
  },
  spotify: {
    refreshToken: '',
  },
};

const emitter = new EventEmitter();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSettings() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_PATH)) {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), JSON.parse(raw));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

function saveSettings(partial) {
  ensureDataDir();
  const current = loadSettings();
  const updated = deepMerge(current, partial);
  validateSettings(updated);
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updated, null, 2), 'utf8');
  emitter.emit('changed', updated);
  return updated;
}

function loadEnv() {
  const defaults = {
    SPOTIFY_CLIENT_ID: '',
    SPOTIFY_CLIENT_SECRET: '',
    SPOTIFY_REDIRECT_URI: 'http://localhost:3000/auth/callback',
    SERVER_PORT: '3000',
  };
  if (!fs.existsSync(ENV_PATH)) {
    return defaults;
  }
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const parsed = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    parsed[key] = val;
  }
  return Object.assign({}, defaults, parsed);
}

function saveEnv(updates) {
  const current = loadEnv();
  const merged = Object.assign({}, current, updates);
  const lines = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(ENV_PATH, lines + '\n', 'utf8');
  // Sync relevant values into process.env so services pick them up
  for (const [k, v] of Object.entries(merged)) {
    process.env[k] = v;
  }
  emitter.emit('envChanged', merged);
  return merged;
}

function validateSettings(s) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (s.wled && s.wled.ip && !ipRegex.test(s.wled.ip)) {
    throw new Error(`Invalid WLED IP address: ${s.wled.ip}`);
  }
  if (s.wled && s.wled.port) {
    const p = Number(s.wled.port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      throw new Error(`Invalid WLED port: ${s.wled.port}`);
    }
  }
  if (s.matrix) {
    const { width, height } = s.matrix;
    if (width !== undefined && (width < 8 || width > 64)) {
      throw new Error(`Matrix width must be 8-64, got ${width}`);
    }
    if (height !== undefined && (height < 8 || height > 64)) {
      throw new Error(`Matrix height must be 8-64, got ${height}`);
    }
  }
}

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

module.exports = { loadSettings, saveSettings, loadEnv, saveEnv, emitter };

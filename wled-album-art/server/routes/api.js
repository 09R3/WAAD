const express = require('express');
const { loadSettings, saveSettings, loadEnv, saveEnv } = require('../config/store');
const { getAuthStatus } = require('../spotify/auth');
const { getCurrentTrack } = require('../spotify/poller');
const { getStatus: getDDPStatus, pushPixels } = require('../wled/ddp');
const { pixelsToObjects } = require('../image/processor');

const router = express.Router();

// SSE clients registry
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) {}
  }
}

// Last processed pixel buffer (shared state set from index.js)
let lastPixels = null;

function setLastPixels(pixels) {
  lastPixels = pixels;
}

router.get('/status', (req, res) => {
  res.json({
    track: getCurrentTrack(),
    auth: getAuthStatus(),
    wled: getDDPStatus(),
  });
});

router.get('/settings', (req, res) => {
  res.json(loadSettings());
});

router.post('/settings', (req, res) => {
  try {
    const updated = saveSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/preview', (req, res) => {
  if (!lastPixels) {
    return res.json([]);
  }
  res.json(pixelsToObjects(lastPixels));
});

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

router.post('/test-push', async (req, res) => {
  if (!lastPixels) {
    return res.status(400).json({ error: 'No pixel data available — wait for a track to load' });
  }
  try {
    const settings = loadSettings();
    await pushPixels(lastPixels, settings.wled.ip, settings.wled.port);
    res.json({ ok: true, pushedAt: Date.now() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/credentials', (req, res) => {
  const env = loadEnv();
  res.json({
    SPOTIFY_CLIENT_ID: env.SPOTIFY_CLIENT_ID || '',
    SPOTIFY_CLIENT_SECRET: env.SPOTIFY_CLIENT_SECRET ? '••••••••' : '',
    SPOTIFY_REDIRECT_URI: env.SPOTIFY_REDIRECT_URI || '',
    SERVER_PORT: env.SERVER_PORT || '3000',
  });
});

router.post('/credentials', (req, res) => {
  try {
    const updates = {};
    const allowed = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI', 'SERVER_PORT'];
    for (const key of allowed) {
      if (req.body[key] !== undefined && req.body[key] !== '••••••••') {
        updates[key] = req.body[key];
      }
    }
    const saved = saveEnv(updates);
    res.json({
      SPOTIFY_CLIENT_ID: saved.SPOTIFY_CLIENT_ID || '',
      SPOTIFY_CLIENT_SECRET: saved.SPOTIFY_CLIENT_SECRET ? '••••••••' : '',
      SPOTIFY_REDIRECT_URI: saved.SPOTIFY_REDIRECT_URI || '',
      SERVER_PORT: saved.SERVER_PORT || '3000',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = { router, broadcast, setLastPixels };

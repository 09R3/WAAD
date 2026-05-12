const express = require('express');
const multer = require('multer');
const { healthCheck, isConfigured } = require('../db/client');
const plays = require('../db/plays');
const stats = require('../db/stats');
const { importSpotifyExport } = require('../import/spotify-export');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// SSE clients for import progress
const importClients = new Set();

function broadcastImport(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of importClients) {
    try { res.write(msg); } catch (_) {}
  }
}

function dbRequired(req, res, next) {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'Database not configured' });
  }
  next();
}

function period(req) {
  return req.query.period || 'alltime';
}

router.get('/db/status', async (req, res) => {
  res.json(await healthCheck());
});

router.get('/stats/summary', dbRequired, async (req, res) => {
  try {
    res.json(await stats.getSummary(period(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/top-tracks', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    res.json(await stats.getTopTracks(period(req), limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/top-artists', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    res.json(await stats.getTopArtists(period(req), limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/daily', dbRequired, async (req, res) => {
  try {
    res.json(await stats.getDailyPlayCounts(period(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/by-hour', dbRequired, async (req, res) => {
  try {
    res.json(await stats.getPlaysByHour(period(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/by-day', dbRequired, async (req, res) => {
  try {
    res.json(await stats.getPlaysByDayOfWeek(period(req)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Behavior ──────────────────────────────────────────────────────────────────

router.get('/stats/sessions', dbRequired, async (req, res) => {
  try { res.json(await stats.getSessionStats()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/streaks', dbRequired, async (req, res) => {
  try { res.json(await stats.getStreaks()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/top-days', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 30);
    res.json(await stats.getTopDays(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/most-active-hour', dbRequired, async (req, res) => {
  try { res.json(await stats.getMostActiveHour()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Deep Dive ─────────────────────────────────────────────────────────────────

router.get('/stats/first-play', dbRequired, async (req, res) => {
  try { res.json(await stats.getFirstPlay()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/one-hit-wonders', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    res.json(await stats.getOneHitWonders(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/years', dbRequired, async (req, res) => {
  try { res.json(await stats.getAvailableYears()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/year-in-review', dbRequired, async (req, res) => {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear(), 10);
    res.json(await stats.getYearInReview(year));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/back-to-back', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 30);
    res.json(await stats.getBackToBackReplays(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Time Patterns ─────────────────────────────────────────────────────────────

router.get('/stats/seasonal', dbRequired, async (req, res) => {
  try { res.json(await stats.getSeasonalTrends()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/top-artist-per-year', dbRequired, async (req, res) => {
  try { res.json(await stats.getTopArtistPerYear()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/time-slots', dbRequired, async (req, res) => {
  try { res.json(await stats.getListeningTimeSlots()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Fun ───────────────────────────────────────────────────────────────────────

router.get('/stats/year-ago', dbRequired, async (req, res) => {
  try { res.json(await stats.getAYearAgoToday()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/late-night', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 20);
    res.json(await stats.getLateNightReport(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/single-day-record', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 20);
    res.json(await stats.getMostPlayedInOneDay(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/artist-year-span', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 20);
    res.json(await stats.getArtistYearSpan(limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────

router.get('/stats/recent', dbRequired, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10);
    res.json(await plays.getRecentPlays(limit, offset));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import/spotify', dbRequired, upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const enrich = req.body.enrich === 'true';
  res.json({ ok: true, message: 'Import started' });

  // Run async after response is sent
  setImmediate(async () => {
    try {
      const result = await importSpotifyExport(req.files, { enrich }, broadcastImport);
      broadcastImport({ phase: 'done', ...result });
    } catch (err) {
      broadcastImport({ phase: 'error', message: err.message });
    }
  });
});

router.get('/import/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"phase":"connected"}\n\n');
  importClients.add(res);
  req.on('close', () => importClients.delete(res));
});

module.exports = router;

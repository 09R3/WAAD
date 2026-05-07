require('dotenv').config();
const express = require('express');
const path = require('path');
const { loadSettings } = require('./config/store');
const { start: startPoller, setTrackChangeHandler, events: pollerEvents } = require('./spotify/poller');
const { fetchAlbumArt } = require('./image/fetcher');
const { processImage } = require('./image/processor');
const { pushPixels } = require('./wled/ddp');
const { router: apiRouter, broadcast, setLastPixels } = require('./routes/api');
const authRouter = require('./routes/auth');
const statsRouter = require('./routes/stats');
const { runMigrations, isConfigured } = require('./db/client');
const { insertPlay } = require('./db/plays');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use('/api', statsRouter);

// Track change pipeline: fetch art → process → push to WLED → record play → broadcast SSE
setTrackChangeHandler(async (track) => {
  if (!track || !track.albumArtUrl) {
    broadcast('trackChange', { track: null, pixels: [] });
    return;
  }

  const settings = loadSettings();
  const { width, height } = settings.matrix;
  const { dithering, ditherAlgorithm } = settings.display;
  const { brightness } = settings.wled;

  let buffer;
  try {
    buffer = await fetchAlbumArt(track.albumArtUrl, track.id);
  } catch (err) {
    console.error('[fetcher] Failed to download album art:', err.message);
    return;
  }

  let pixels;
  try {
    pixels = await processImage(buffer, width, height, { dithering, ditherAlgorithm });
  } catch (err) {
    console.error('[processor] Failed to process image:', err.message);
    return;
  }

  // Apply brightness scaling
  const scaled = new Uint8Array(pixels.length);
  const scale = brightness / 255;
  for (let i = 0; i < pixels.length; i++) {
    scaled[i] = Math.round(pixels[i] * scale);
  }

  setLastPixels(scaled);

  try {
    await pushPixels(scaled, settings.wled.ip, settings.wled.port);
    console.log(`[ddp] Pushed ${width * height} pixels for "${track.name}" by ${track.artist}`);
  } catch (err) {
    console.error('[ddp] Push failed:', err.message);
  }

  // Record play to DB (non-blocking, optional)
  if (isConfigured()) {
    insertPlay({
      track_id: track.id,
      track_name: track.name,
      artist_id: track.artistId || null,
      artist_name: track.artist,
      album_id: track.albumId || null,
      album_name: track.album || null,
      album_art_url: track.albumArtUrl || null,
      duration_ms: track.durationMs || null,
      spotify_uri: track.spotifyUri || null,
      source: 'live',
    }).catch((err) => console.error('[db] insertPlay failed:', err.message));
  }

  broadcast('trackChange', {
    track,
    pushedAt: Date.now(),
  });
});

pollerEvents.on('error', (e) => {
  console.error('[poller]', e.message, e.detail || '');
});

const PORT = process.env.SERVER_PORT || 3000;
app.listen(PORT, async () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  if (isConfigured()) {
    await runMigrations();
  }
  startPoller();
  console.log('[poller] Started');
});

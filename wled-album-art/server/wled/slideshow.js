const { getTopAlbums } = require('../db/stats');
const { fetchAlbumArt } = require('../image/fetcher');
const { processImage } = require('../image/processor');
const { drawNumber } = require('../image/overlay');
const { pushPixels } = require('./ddp');
const { loadSettings } = require('../config/store');
const { isConfigured } = require('../db/client');

const SLIDE_INTERVAL_MS = 10000;

let timer = null;
let albums = [];
let currentIdx = 0;
let setLastPixelsFn = null;

function init(setLastPixels) {
  setLastPixelsFn = setLastPixels;
}

async function loadAlbums() {
  if (!isConfigured()) return;
  try {
    albums = await getTopAlbums(10);
  } catch (err) {
    console.error('[slideshow] Failed to load albums:', err.message);
    albums = [];
  }
}

async function showSlide(idx) {
  if (!albums.length) return;
  const album = albums[idx % albums.length];
  if (!album || !album.album_art_url) return;

  const settings = loadSettings();
  const { width, height } = settings.matrix;
  const { dithering, ditherAlgorithm } = settings.display;
  const { brightness } = settings.wled;

  let buffer;
  try {
    // Use album_id or album_name as cache key so we don't re-download unchanged art
    buffer = await fetchAlbumArt(album.album_art_url, `album-${album.album_id || album.album_name}`);
  } catch (err) {
    console.error('[slideshow] Art fetch failed:', err.message);
    return;
  }

  let pixels;
  try {
    pixels = await processImage(buffer, width, height, { dithering, ditherAlgorithm });
  } catch (err) {
    console.error('[slideshow] Image process failed:', err.message);
    return;
  }

  const scaled = new Uint8Array(pixels.length);
  const scale = brightness / 255;
  for (let i = 0; i < pixels.length; i++) {
    scaled[i] = Math.round(pixels[i] * scale);
  }

  drawNumber(scaled, width, height, idx + 1);

  if (setLastPixelsFn) setLastPixelsFn(scaled);

  try {
    await pushPixels(scaled, settings.wled.ip, settings.wled.port);
    console.log(`[slideshow] Slide ${idx + 1}/${albums.length}: ${album.album_name} by ${album.artist_name}`);
  } catch (err) {
    console.error('[slideshow] DDP push failed:', err.message);
  }
}

async function start() {
  stop();
  await loadAlbums();
  if (!albums.length) {
    console.log('[slideshow] No albums in DB, skipping idle slideshow');
    return;
  }
  currentIdx = 0;
  await showSlide(currentIdx);
  timer = setInterval(async () => {
    currentIdx = (currentIdx + 1) % albums.length;
    await showSlide(currentIdx);
  }, SLIDE_INTERVAL_MS);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function isRunning() {
  return timer !== null;
}

module.exports = { init, start, stop, isRunning };

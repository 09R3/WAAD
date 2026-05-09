const axios = require('axios');
const EventEmitter = require('events');
const { getValidAccessToken, getAuthStatus } = require('./auth');
const { loadSettings, emitter: configEmitter } = require('../config/store');

const events = new EventEmitter();

let timer = null;
let currentTrackId = null;
let currentTrack = null;
let onTrackChange = null;

function setTrackChangeHandler(fn) {
  onTrackChange = fn;
}

async function poll() {
  const authStatus = getAuthStatus();
  if (!authStatus.hasRefreshToken) return;

  let token;
  try {
    token = await getValidAccessToken();
  } catch (err) {
    events.emit('error', { message: 'Token refresh failed', detail: err.message });
    return;
  }

  let response;
  try {
    response = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: (s) => s < 500,
    });
  } catch (err) {
    events.emit('error', { message: 'Spotify API request failed', detail: err.message });
    return;
  }

  if (response.status === 204 || !response.data || !response.data.item) {
    if (currentTrack !== null) {
      currentTrack = null;
      currentTrackId = null;
      events.emit('trackChange', null);
    }
    return;
  }

  if (response.status === 401) {
    events.emit('error', { message: 'Spotify unauthorized', detail: 'Token may be invalid' });
    return;
  }

  const { item, is_playing } = response.data;
  const trackId = item.id;

  const track = {
    id: trackId,
    name: item.name,
    artist: item.artists.map((a) => a.name).join(', '),
    artistId: item.artists[0]?.id || null,
    album: item.album.name,
    albumId: item.album.id || null,
    albumArtUrl: item.album.images[0]?.url || null,
    durationMs: item.duration_ms || null,
    spotifyUri: item.uri || null,
    isPlaying: is_playing,
  };

  currentTrack = track;

  if (trackId !== currentTrackId) {
    currentTrackId = trackId;
    events.emit('trackChange', track);
    if (onTrackChange) {
      try {
        await onTrackChange(track);
      } catch (err) {
        events.emit('error', { message: 'Track change handler error', detail: err.message });
      }
    }
  }
}

function start() {
  stop();
  const settings = loadSettings();
  const interval = settings.display?.pollingIntervalMs || 4000;
  poll();
  timer = setInterval(poll, interval);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function getCurrentTrack() {
  return currentTrack;
}

configEmitter.on('changed', (settings) => {
  if (timer) {
    start();
  }
});

module.exports = { start, stop, getCurrentTrack, setTrackChangeHandler, events };

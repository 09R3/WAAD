// Main UI — wires SSE, now-playing card, and auth status

let sseSource = null;

function updateNowPlaying(track) {
  const albumArt = document.getElementById('album-art');
  const placeholder = document.getElementById('album-art-placeholder');
  const trackName = document.getElementById('track-name');
  const trackArtist = document.getElementById('track-artist');
  const trackAlbum = document.getElementById('track-album');

  if (!track) {
    albumArt.style.display = 'none';
    placeholder.style.display = 'flex';
    trackName.textContent = 'Nothing playing';
    trackArtist.textContent = '—';
    trackAlbum.textContent = '';
    return;
  }

  trackName.textContent = track.name || '—';
  trackArtist.textContent = track.artist || '—';
  trackAlbum.textContent = track.album || '';

  if (track.albumArtUrl) {
    albumArt.src = track.albumArtUrl;
    albumArt.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    albumArt.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

function updateAuthBadge(auth) {
  const badge = document.getElementById('spotify-badge');
  const detail = document.getElementById('auth-detail');
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');

  if (auth.connected) {
    badge.className = 'badge badge-connected';
    badge.textContent = 'Spotify Connected';
    detail.textContent = auth.expiresInMin !== null
      ? `Token expires in ${auth.expiresInMin} min`
      : 'Connected';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = '';
  } else if (auth.hasRefreshToken) {
    badge.className = 'badge badge-disconnected';
    badge.textContent = 'Reconnecting…';
    detail.textContent = 'Refreshing token…';
    btnConnect.style.display = '';
    btnDisconnect.style.display = '';
  } else {
    badge.className = 'badge badge-disconnected';
    badge.textContent = 'Disconnected';
    detail.textContent = 'Not connected';
    btnConnect.style.display = '';
    btnDisconnect.style.display = 'none';
  }
}

function updateWledBadge(ddp, pushedAt) {
  const badge = document.getElementById('wled-badge');
  const status = document.getElementById('push-status');

  if (ddp.lastError) {
    badge.className = 'badge badge-error';
    badge.textContent = 'WLED Error';
    status.textContent = `Error: ${ddp.lastError}`;
  } else if (ddp.lastPushAt || pushedAt) {
    const t = pushedAt || ddp.lastPushAt;
    badge.className = 'badge badge-connected';
    badge.textContent = 'WLED OK';
    status.textContent = `Last push: ${new Date(t).toLocaleTimeString()}`;
  } else {
    badge.className = 'badge badge-disconnected';
    badge.textContent = 'WLED Idle';
    status.textContent = '';
  }
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateNowPlaying(data.track);
    updateAuthBadge(data.auth);
    updateWledBadge(data.wled, null);
  } catch (err) {
    console.error('Status fetch failed:', err);
  }
}

async function fetchPreview() {
  try {
    const res = await fetch('/api/preview');
    const pixels = await res.json();
    if (pixels.length > 0) {
      const settingsRes = await fetch('/api/settings');
      const settings = await settingsRes.json();
      renderPreview(pixels, settings.matrix.width, settings.matrix.height);
    }
  } catch (err) {
    console.error('Preview fetch failed:', err);
  }
}

async function refreshPreview() {
  const btn = document.getElementById('btn-refresh-preview');
  const width = parseInt(document.getElementById('matrix-width').value, 10);
  const height = parseInt(document.getElementById('matrix-height').value, 10);

  btn.textContent = '↻ …';
  btn.disabled = true;

  try {
    const res = await fetch('/api/preview');
    const pixels = await res.json();
    if (pixels.length > 0) {
      renderPreview(pixels, width, height);
    }
  } catch (err) {
    console.error('Preview refresh failed:', err);
  } finally {
    btn.textContent = '↻ Refresh';
    btn.disabled = false;
  }
}

function connectSSE() {
  if (sseSource) sseSource.close();

  sseSource = new EventSource('/api/stream');

  sseSource.addEventListener('connected', () => {
    console.log('[SSE] Connected');
  });

  sseSource.addEventListener('trackChange', async (e) => {
    const data = JSON.parse(e.data);
    updateNowPlaying(data.track);
    if (data.pushedAt) {
      updateWledBadge({ lastError: null, lastPushAt: data.pushedAt }, data.pushedAt);
    }
    // Slight delay to let server update preview state
    setTimeout(fetchPreview, 200);
  });

  sseSource.onerror = () => {
    console.warn('[SSE] Connection lost, reconnecting in 3s…');
    sseSource.close();
    setTimeout(connectSSE, 3000);
  };
}

// Handle OAuth redirect params
function handleAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('auth_success')) {
    showFeedback('cred-feedback', true, 'Spotify connected successfully!');
    history.replaceState(null, '', '/');
  } else if (params.has('auth_error')) {
    showFeedback('cred-feedback', false, `Auth error: ${params.get('auth_error')}`);
    history.replaceState(null, '', '/');
  }
}

async function init() {
  handleAuthRedirect();
  await loadSettings();
  await fetchStatus();
  await fetchPreview();
  connectSSE();
}

document.addEventListener('DOMContentLoaded', init);

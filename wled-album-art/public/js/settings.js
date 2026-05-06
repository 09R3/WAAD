function toggleDitheringSection() {
  const on = document.getElementById('dithering-toggle').checked;
  document.getElementById('dither-algorithm-section').classList.toggle('visible', on);
}

function toggleSecret(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function showFeedback(id, ok, msg) {
  const el = document.getElementById(id);
  el.className = `feedback show ${ok ? 'ok' : 'err'}`;
  el.textContent = msg;
  setTimeout(() => el.classList.remove('show'), 3500);
}

async function saveSettings() {
  const body = {
    matrix: {
      width: parseInt(document.getElementById('matrix-width').value, 10),
      height: parseInt(document.getElementById('matrix-height').value, 10),
    },
    wled: {
      ip: document.getElementById('wled-ip').value.trim(),
      port: parseInt(document.getElementById('wled-port').value, 10),
      brightness: parseInt(document.getElementById('wled-brightness').value, 10),
    },
    display: {
      dithering: document.getElementById('dithering-toggle').checked,
      ditherAlgorithm: document.getElementById('dither-algorithm').value,
      pollingIntervalMs: parseInt(document.getElementById('polling-interval').value, 10),
    },
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    showFeedback('settings-feedback', true, 'Settings saved');
  } catch (err) {
    showFeedback('settings-feedback', false, err.message);
  }
}

async function saveCredentials() {
  const body = {
    SPOTIFY_CLIENT_ID: document.getElementById('cred-client-id').value.trim(),
    SPOTIFY_CLIENT_SECRET: document.getElementById('cred-client-secret').value,
    SPOTIFY_REDIRECT_URI: document.getElementById('cred-redirect-uri').value.trim(),
  };

  try {
    const res = await fetch('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    showFeedback('cred-feedback', true, 'Credentials saved');
    // Mask secret again after save
    const secretInput = document.getElementById('cred-client-secret');
    if (body.SPOTIFY_CLIENT_SECRET && body.SPOTIFY_CLIENT_SECRET !== '••••••••') {
      secretInput.value = '••••••••';
      secretInput.type = 'password';
    }
  } catch (err) {
    showFeedback('cred-feedback', false, err.message);
  }
}

async function testPush() {
  try {
    const res = await fetch('/api/test-push', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Push failed');
    showFeedback('settings-feedback', true, 'Pushed to WLED ✓');
  } catch (err) {
    showFeedback('settings-feedback', false, err.message);
  }
}

async function disconnectSpotify() {
  await fetch('/auth/disconnect', { method: 'POST' });
  location.reload();
}

async function loadSettings() {
  try {
    const [settingsRes, credsRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/credentials'),
    ]);
    const s = await settingsRes.json();
    const c = await credsRes.json();

    document.getElementById('matrix-width').value = s.matrix.width;
    document.getElementById('matrix-height').value = s.matrix.height;
    document.getElementById('wled-ip').value = s.wled.ip;
    document.getElementById('wled-port').value = s.wled.port;
    document.getElementById('wled-brightness').value = s.wled.brightness;
    document.getElementById('brightness-val').textContent = s.wled.brightness;
    document.getElementById('polling-interval').value = s.display.pollingIntervalMs;
    document.getElementById('polling-val').textContent = (s.display.pollingIntervalMs / 1000).toFixed(1) + 's';
    document.getElementById('dithering-toggle').checked = s.display.dithering;
    document.getElementById('dither-algorithm').value = s.display.ditherAlgorithm;
    toggleDitheringSection();

    document.getElementById('cred-client-id').value = c.SPOTIFY_CLIENT_ID;
    document.getElementById('cred-client-secret').value = c.SPOTIFY_CLIENT_SECRET;
    document.getElementById('cred-redirect-uri').value = c.SPOTIFY_REDIRECT_URI;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

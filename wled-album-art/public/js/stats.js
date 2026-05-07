// Stats page — data loading, Chart.js rendering, recent plays, import

let currentPeriod = 'week';
let recentOffset = 0;
let chartDaily = null;
let chartHour = null;
let chartDow = null;
let dbConfigured = false;

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#2e2e2e' } },
    y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#2e2e2e' }, beginAtZero: true },
  },
};

function formatMs(ms) {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return formatDate(ts);
}

async function initStats() {
  const dbRes = await fetch('/api/db/status').then((r) => r.json()).catch(() => ({}));
  dbConfigured = dbRes.configured;

  if (!dbConfigured) {
    document.getElementById('stats-no-db').style.display = 'flex';
    document.getElementById('stats-content').style.display = 'none';
    return;
  }

  document.getElementById('stats-no-db').style.display = 'none';
  document.getElementById('stats-content').style.display = 'block';

  await loadStatsForPeriod(currentPeriod);
  await loadRecentPlays(true);
}

async function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.period === period);
  });
  await loadStatsForPeriod(period);
}

async function loadStatsForPeriod(period) {
  const [summary, topTracks, topArtists, daily, byHour, byDow] = await Promise.all([
    fetch(`/api/stats/summary?period=${period}`).then((r) => r.json()).catch(() => null),
    fetch(`/api/stats/top-tracks?period=${period}&limit=10`).then((r) => r.json()).catch(() => []),
    fetch(`/api/stats/top-artists?period=${period}&limit=10`).then((r) => r.json()).catch(() => []),
    fetch(`/api/stats/daily?period=${period}`).then((r) => r.json()).catch(() => []),
    fetch(`/api/stats/by-hour?period=${period}`).then((r) => r.json()).catch(() => []),
    fetch(`/api/stats/by-day?period=${period}`).then((r) => r.json()).catch(() => []),
  ]);

  renderSummary(summary);
  renderTopTracks(topTracks);
  renderTopArtists(topArtists);
  renderDailyChart(daily);
  renderHourChart(byHour);
  renderDowChart(byDow);
}

function renderSummary(s) {
  if (!s) return;
  document.getElementById('sum-plays').textContent = Number(s.total_plays).toLocaleString();
  document.getElementById('sum-time').textContent = formatMs(parseInt(s.total_ms || 0, 10));
  document.getElementById('sum-tracks').textContent = Number(s.unique_tracks).toLocaleString();
  document.getElementById('sum-artists').textContent = Number(s.unique_artists).toLocaleString();
  const range = s.first_play && s.last_play
    ? `${formatDate(s.first_play)} – ${formatDate(s.last_play)}`
    : '—';
  document.getElementById('sum-range').textContent = range;
}

function renderTopTracks(tracks) {
  const el = document.getElementById('top-tracks-list');
  if (!tracks.length) { el.innerHTML = '<div class="list-empty">No data yet</div>'; return; }
  el.innerHTML = tracks.map((t, i) => `
    <div class="top-item">
      <span class="top-rank">${i + 1}</span>
      ${t.album_art_url
        ? `<img class="top-art" src="${t.album_art_url}" alt="" loading="lazy" />`
        : `<div class="top-art-placeholder">♪</div>`}
      <div class="top-info">
        <div class="top-name">${esc(t.track_name)}</div>
        <div class="top-sub">${esc(t.artist_name)}</div>
      </div>
      <span class="top-count">${t.play_count}</span>
    </div>`).join('');
}

function renderTopArtists(artists) {
  const el = document.getElementById('top-artists-list');
  if (!artists.length) { el.innerHTML = '<div class="list-empty">No data yet</div>'; return; }
  el.innerHTML = artists.map((a, i) => `
    <div class="top-item">
      <span class="top-rank">${i + 1}</span>
      <div class="top-art-placeholder">🎤</div>
      <div class="top-info">
        <div class="top-name">${esc(a.artist_name)}</div>
        <div class="top-sub">${formatMs(parseInt(a.total_ms || 0, 10))} listened</div>
      </div>
      <span class="top-count">${a.play_count}</span>
    </div>`).join('');
}

function renderDailyChart(data) {
  const ctx = document.getElementById('chart-daily').getContext('2d');
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((d) => d.date),
      datasets: [{
        data: data.map((d) => d.count),
        borderColor: '#1DB954',
        backgroundColor: 'rgba(29,185,84,.1)',
        fill: true,
        tension: 0.3,
        pointRadius: data.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxTicksLimit: 8 } },
      },
    },
  });
}

function renderHourChart(data) {
  const ctx = document.getElementById('chart-hour').getContext('2d');
  if (chartHour) chartHour.destroy();
  chartHour = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => `${d.hour}h`),
      datasets: [{ data: data.map((d) => d.count), backgroundColor: 'rgba(29,185,84,.7)', borderRadius: 3 }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxTicksLimit: 12 } },
      },
    },
  });
}

function renderDowChart(data) {
  const ctx = document.getElementById('chart-dow').getContext('2d');
  if (chartDow) chartDow.destroy();
  chartDow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.day),
      datasets: [{ data: data.map((d) => d.count), backgroundColor: 'rgba(29,185,84,.7)', borderRadius: 3 }],
    },
    options: CHART_DEFAULTS,
  });
}

async function loadRecentPlays(reset = false) {
  if (reset) {
    recentOffset = 0;
    document.getElementById('recent-list').innerHTML = '';
  }
  const limit = 50;
  const rows = await fetch(`/api/stats/recent?limit=${limit}&offset=${recentOffset}`)
    .then((r) => r.json()).catch(() => []);

  const el = document.getElementById('recent-list');
  for (const row of rows) {
    const div = document.createElement('div');
    div.className = 'recent-item';
    div.innerHTML = `
      ${row.album_art_url
        ? `<img class="recent-art" src="${row.album_art_url}" alt="" loading="lazy" />`
        : `<div class="recent-art" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)">♪</div>`}
      <div class="recent-info">
        <div class="recent-name">${esc(row.track_name)}</div>
        <div class="recent-sub">${esc(row.artist_name)}${row.album_name ? ' · ' + esc(row.album_name) : ''}</div>
      </div>
      <span class="recent-time">${formatRelative(row.played_at)}</span>`;
    el.appendChild(div);
  }

  recentOffset += rows.length;
  document.getElementById('btn-load-more').style.display = rows.length < limit ? 'none' : '';
}

function loadMorePlays() {
  loadRecentPlays(false);
}

// Import
let importSse = null;

async function startImport() {
  const fileInput = document.getElementById('import-files');
  const enrich = document.getElementById('import-enrich').checked;
  const feedback = document.getElementById('import-feedback');
  const progress = document.getElementById('import-progress');

  if (!fileInput.files.length) {
    showFeedback('import-feedback', false, 'Please select at least one JSON file');
    return;
  }

  // Connect to SSE before starting import
  if (importSse) importSse.close();
  importSse = new EventSource('/api/import/progress');
  progress.style.display = 'block';
  feedback.className = 'feedback';

  importSse.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.phase === 'counting') {
      document.getElementById('import-label').textContent = `Counting records… ${data.total} total`;
    } else if (data.phase === 'importing') {
      document.getElementById('import-bar').style.width = `${data.percent}%`;
      document.getElementById('import-label').textContent =
        `Importing… ${data.inserted} inserted, ${data.skipped} skipped (${data.percent}%)`;
    } else if (data.phase === 'done') {
      document.getElementById('import-bar').style.width = '100%';
      document.getElementById('import-label').textContent = '';
      showFeedback('import-feedback', true,
        `Done — ${data.inserted} tracks inserted, ${data.skipped} duplicates skipped`);
      importSse.close();
      progress.style.display = 'none';
      loadStatsForPeriod(currentPeriod);
      loadRecentPlays(true);
    } else if (data.phase === 'error') {
      showFeedback('import-feedback', false, `Import error: ${data.message}`);
      importSse.close();
      progress.style.display = 'none';
    }
  };

  importSse.onerror = () => {
    importSse.close();
  };

  // Small delay to let SSE connect before we trigger the import
  await new Promise((r) => setTimeout(r, 300));

  const formData = new FormData();
  for (const file of fileInput.files) formData.append('files', file);
  formData.append('enrich', enrich ? 'true' : 'false');

  try {
    const res = await fetch('/api/import/spotify', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      showFeedback('import-feedback', false, err.error || 'Upload failed');
      importSse.close();
      progress.style.display = 'none';
    }
  } catch (err) {
    showFeedback('import-feedback', false, err.message);
    importSse.close();
    progress.style.display = 'none';
  }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

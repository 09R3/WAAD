// Stats page — tabs: General | Behavior | Deep Dive | Time Patterns | Fun

let currentPeriod = 'week';
let currentStatsTab = 'general';
let recentOffset = 0;
let dbConfigured = false;
let importSse = null;

const charts = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
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

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

function makeChart(id, type, labels, data, color = '#1DB954', opts = {}) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx.getContext('2d'), {
    type,
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: type === 'line' ? `${color}1a` : `${color}b3`,
        fill: type === 'line',
        tension: type === 'line' ? 0.3 : 0,
        pointRadius: type === 'line' && labels.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        borderRadius: type === 'bar' ? 3 : 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: '#888', font: { size: 10 }, maxTicksLimit: opts.maxX || 10 },
          grid: { color: '#2e2e2e' },
        },
        y: {
          ticks: { color: '#888', font: { size: 10 } },
          grid: { color: '#2e2e2e' },
          beginAtZero: true,
        },
      },
      ...opts.extra,
    },
  });
}

function statCard(label, value, sub = '') {
  return `<div class="stat-tile">
    <div class="stat-tile-val">${value}</div>
    <div class="stat-tile-label">${label}</div>
    ${sub ? `<div class="stat-tile-sub">${sub}</div>` : ''}
  </div>`;
}

function topItem(rank, name, sub, count, artUrl, countLabel = '') {
  return `<div class="top-item">
    <span class="top-rank">${rank}</span>
    ${artUrl
      ? `<img class="top-art" src="${esc(artUrl)}" alt="" loading="lazy" />`
      : `<div class="top-art-placeholder">♪</div>`}
    <div class="top-info">
      <div class="top-name">${esc(name)}</div>
      ${sub ? `<div class="top-sub">${esc(sub)}</div>` : ''}
    </div>
    <span class="top-count">${count}${countLabel ? `<span class="top-count-label"> ${countLabel}</span>` : ''}</span>
  </div>`;
}

function emptyState(msg) {
  return `<div class="list-empty">${msg}</div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initStats() {
  const dbRes = await fetch('/api/db/status').then(r => r.json()).catch(() => ({}));
  dbConfigured = dbRes.configured;
  document.getElementById('stats-no-db').style.display = dbConfigured ? 'none' : 'flex';
  document.getElementById('stats-content').style.display = dbConfigured ? 'block' : 'none';
  if (!dbConfigured) return;
  showStatsTab('general');
}

function showStatsTab(tab) {
  currentStatsTab = tab;
  document.querySelectorAll('.stats-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.stats-tab-section').forEach(s =>
    s.classList.toggle('active', s.id === `stats-tab-${tab}`)
  );
  if (tab === 'general') loadGeneralTab();
  else if (tab === 'behavior') loadBehaviorTab();
  else if (tab === 'deepdive') loadDeepDiveTab();
  else if (tab === 'timepatterns') loadTimePatternsTab();
  else if (tab === 'fun') loadFunTab();
}

// ── General tab ───────────────────────────────────────────────────────────────

async function loadGeneralTab() {
  const p = currentPeriod;
  const [summary, topTracks, topArtists, daily, byHour, byDow] = await Promise.all([
    api(`/api/stats/summary?period=${p}`).catch(() => null),
    api(`/api/stats/top-tracks?period=${p}&limit=10`).catch(() => []),
    api(`/api/stats/top-artists?period=${p}&limit=10`).catch(() => []),
    api(`/api/stats/daily?period=${p}`).catch(() => []),
    api(`/api/stats/by-hour?period=${p}`).catch(() => []),
    api(`/api/stats/by-day?period=${p}`).catch(() => []),
  ]);
  renderSummary(summary);
  renderTopList('top-tracks-list', topTracks, t => topItem(
    topTracks.indexOf(t) + 1, t.track_name, t.artist_name, t.play_count, t.album_art_url, 'plays'
  ));
  renderTopList('top-artists-list', topArtists, a => topItem(
    topArtists.indexOf(a) + 1, a.artist_name, formatMs(parseInt(a.total_ms || 0)), a.play_count, null, 'plays'
  ));
  makeChart('chart-daily', 'line', daily.map(d => d.date), daily.map(d => d.count), '#1DB954', { maxX: 8 });
  makeChart('chart-hour', 'bar', byHour.map(d => `${d.hour}h`), byHour.map(d => d.count), '#1DB954', { maxX: 12 });
  makeChart('chart-dow', 'bar', byDow.map(d => d.day), byDow.map(d => d.count));
  await loadRecentPlays(true);
}

function renderSummary(s) {
  if (!s) return;
  document.getElementById('sum-plays').textContent = Number(s.total_plays).toLocaleString();
  document.getElementById('sum-time').textContent = formatMs(parseInt(s.total_ms || 0, 10));
  document.getElementById('sum-tracks').textContent = Number(s.unique_tracks).toLocaleString();
  document.getElementById('sum-artists').textContent = Number(s.unique_artists).toLocaleString();
  document.getElementById('sum-range').textContent = s.first_play && s.last_play
    ? `${formatDate(s.first_play)} – ${formatDate(s.last_play)}` : '—';
}

function renderTopList(id, items, rowFn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = items.length ? items.map(rowFn).join('') : emptyState('No data yet');
}

async function setPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === period)
  );
  if (currentStatsTab === 'general') await loadGeneralTab();
}

async function loadRecentPlays(reset = false) {
  if (reset) { recentOffset = 0; document.getElementById('recent-list').innerHTML = ''; }
  const rows = await api(`/api/stats/recent?limit=50&offset=${recentOffset}`).catch(() => []);
  const el = document.getElementById('recent-list');
  for (const row of rows) {
    const div = document.createElement('div');
    div.className = 'recent-item';
    div.innerHTML = `
      ${row.album_art_url
        ? `<img class="recent-art" src="${esc(row.album_art_url)}" alt="" loading="lazy" />`
        : `<div class="recent-art" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)">♪</div>`}
      <div class="recent-info">
        <div class="recent-name">${esc(row.track_name)}</div>
        <div class="recent-sub">${esc(row.artist_name)}${row.album_name ? ' · ' + esc(row.album_name) : ''}</div>
      </div>
      <span class="recent-time">${formatRelative(row.played_at)}</span>`;
    el.appendChild(div);
  }
  recentOffset += rows.length;
  document.getElementById('btn-load-more').style.display = rows.length < 50 ? 'none' : '';
}

function loadMorePlays() { loadRecentPlays(false); }

// ── Behavior tab ──────────────────────────────────────────────────────────────

async function loadBehaviorTab() {
  const [sessions, streaks, topDays, activeHour] = await Promise.all([
    api('/api/stats/sessions').catch(() => null),
    api('/api/stats/streaks').catch(() => null),
    api('/api/stats/top-days?limit=10').catch(() => []),
    api('/api/stats/most-active-hour').catch(() => null),
  ]);

  // Session tiles
  const sessionEl = document.getElementById('behavior-sessions');
  if (sessions) {
    sessionEl.innerHTML = `
      <div class="stat-tiles">
        ${statCard('Total Sessions', Number(sessions.total_sessions).toLocaleString())}
        ${statCard('Avg Session', `${sessions.avg_duration_min ?? '—'} min`)}
        ${statCard('Longest Session', sessions.longest_duration_min ? `${sessions.longest_duration_min} min` : '—',
          sessions.longest_start ? formatDate(sessions.longest_start) : '')}
        ${statCard('Tracks in Longest', sessions.longest_track_count ?? '—')}
      </div>`;
  } else {
    sessionEl.innerHTML = emptyState('No session data');
  }

  // Streak tiles
  const streakEl = document.getElementById('behavior-streaks');
  if (streaks) {
    streakEl.innerHTML = `
      <div class="stat-tiles">
        ${statCard('Current Streak', streaks.current ? `${streaks.current} day${streaks.current !== 1 ? 's' : ''}` : 'None')}
        ${statCard('Longest Streak', streaks.longest ? `${streaks.longest} days` : '—',
          streaks.longest_start ? `${formatDate(streaks.longest_start)} – ${formatDate(streaks.longest_end)}` : '')}
        ${activeHour ? statCard('Most Active Hour', `${activeHour.hour}:00`, `${Number(activeHour.count).toLocaleString()} plays`) : ''}
      </div>`;
  } else {
    streakEl.innerHTML = emptyState('No streak data');
  }

  // Top days chart
  if (topDays.length) {
    makeChart(
      'chart-top-days', 'bar',
      topDays.map(d => d.date), topDays.map(d => d.count),
      '#1DB954', { maxX: 10 }
    );
  }
}

// ── Deep Dive tab ─────────────────────────────────────────────────────────────

async function loadDeepDiveTab() {
  const [firstPlay, years] = await Promise.all([
    api('/api/stats/first-play').catch(() => null),
    api('/api/stats/years').catch(() => []),
  ]);

  // First play ever
  const fpEl = document.getElementById('deepdive-first');
  if (firstPlay) {
    fpEl.innerHTML = `<div class="first-play-card">
      ${firstPlay.album_art_url ? `<img src="${esc(firstPlay.album_art_url)}" class="first-play-art" alt="" />` : ''}
      <div>
        <div class="first-play-label">Your first ever play</div>
        <div class="first-play-track">${esc(firstPlay.track_name)}</div>
        <div class="first-play-artist">${esc(firstPlay.artist_name)}</div>
        <div class="first-play-date">${formatDate(firstPlay.played_at)}</div>
      </div>
    </div>`;
  } else {
    fpEl.innerHTML = emptyState('No data yet');
  }

  // Year in review — populate year dropdown
  const yearSel = document.getElementById('year-review-select');
  if (years.length) {
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    loadYearInReview(years[0]);
  }

  // Load one-hit wonders and back-to-back
  loadOneHitWonders();
  loadBackToBack();
}

async function loadYearInReview(year) {
  const data = await api(`/api/stats/year-in-review?year=${year}`).catch(() => ({ tracks: [], artists: [] }));
  renderTopList('year-tracks-list', data.tracks, (t, i) => topItem(
    data.tracks.indexOf(t) + 1, t.track_name, t.artist_name, t.play_count, t.album_art_url, 'plays'
  ));
  renderTopList('year-artists-list', data.artists, (a) => topItem(
    data.artists.indexOf(a) + 1, a.artist_name, formatMs(parseInt(a.total_ms || 0)), a.play_count, null, 'plays'
  ));
}

async function loadOneHitWonders() {
  const data = await api('/api/stats/one-hit-wonders?limit=20').catch(() => []);
  const el = document.getElementById('one-hit-wonders-list');
  if (!el) return;
  el.innerHTML = data.length
    ? data.map((t, i) => topItem(i + 1, t.track_name, `${esc(t.artist_name)} · ${formatDate(t.played_at)}`, 1, t.album_art_url, 'play')).join('')
    : emptyState('No one-hit wonders found');
}

async function loadBackToBack() {
  const data = await api('/api/stats/back-to-back?limit=10').catch(() => []);
  const el = document.getElementById('back-to-back-list');
  if (!el) return;
  el.innerHTML = data.length
    ? data.map((t, i) => topItem(i + 1, t.track_name, `${esc(t.artist_name)} · ${formatDate(t.first_at)}`, t.repeat_count, t.album_art_url, 'in a row')).join('')
    : emptyState('No back-to-back replays found');
}

// ── Time Patterns tab ─────────────────────────────────────────────────────────

async function loadTimePatternsTab() {
  const [seasonal, topPerYear, timeSlots] = await Promise.all([
    api('/api/stats/seasonal').catch(() => []),
    api('/api/stats/top-artist-per-year').catch(() => []),
    api('/api/stats/time-slots').catch(() => []),
  ]);

  // Time slots donut-style bar
  const slotsEl = document.getElementById('time-slots-list');
  if (slotsEl && timeSlots.length) {
    const maxCount = Math.max(...timeSlots.map(s => parseInt(s.count)));
    slotsEl.innerHTML = timeSlots.map(s => {
      const pct = Math.round((parseInt(s.count) / maxCount) * 100);
      const icons = { 'Late Night': '🌙', 'Work Hours': '💼', 'Weekend Morning': '☀️', 'Evening': '🌆', 'Other': '🎵' };
      return `<div class="slot-item">
        <div class="slot-header">
          <span>${icons[s.slot] || '🎵'} ${s.slot}</span>
          <span class="slot-count">${Number(s.count).toLocaleString()} plays · ${formatMs(parseInt(s.total_ms || 0))}</span>
        </div>
        <div class="slot-bar-wrap"><div class="slot-bar" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  // Top artist per year
  const yearArtistEl = document.getElementById('top-artist-year-list');
  if (yearArtistEl) {
    yearArtistEl.innerHTML = topPerYear.length
      ? topPerYear.map(r => `
        <div class="top-item">
          <span class="top-rank" style="min-width:40px;font-size:13px;font-weight:700;color:var(--text)">${r.year}</span>
          <div class="top-art-placeholder">🎤</div>
          <div class="top-info"><div class="top-name">${esc(r.artist_name)}</div></div>
          <span class="top-count">${r.play_count}<span class="top-count-label"> plays</span></span>
        </div>`).join('')
      : emptyState('No data yet');
  }

  // Seasonal chart
  if (seasonal.length) {
    const seasons = ['Winter', 'Spring', 'Summer', 'Fall'];
    const colors = { Winter: '#6eb5ff', Spring: '#5fcf80', Summer: '#ffb347', Fall: '#e07040' };
    const years = [...new Set(seasonal.map(r => r.year))].sort();

    const ctx = document.getElementById('chart-seasonal');
    if (ctx) {
      if (charts['chart-seasonal']) { charts['chart-seasonal'].destroy(); }
      charts['chart-seasonal'] = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: years,
          datasets: seasons.map(s => ({
            label: s,
            data: years.map(y => {
              const row = seasonal.find(r => r.year === y && r.season === s);
              return row ? parseInt(row.count) : 0;
            }),
            backgroundColor: `${colors[s]}b3`,
            borderRadius: 3,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: '#888', font: { size: 11 } } } },
          scales: {
            x: { stacked: false, ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#2e2e2e' } },
            y: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: '#2e2e2e' }, beginAtZero: true },
          },
        },
      });
    }
  }
}

// ── Fun tab ───────────────────────────────────────────────────────────────────

async function loadFunTab() {
  const [yearAgo, lateNight, singleDay, yearSpan] = await Promise.all([
    api('/api/stats/year-ago').catch(() => []),
    api('/api/stats/late-night?limit=10').catch(() => ({ plays: [], total: 0 })),
    api('/api/stats/single-day-record?limit=10').catch(() => []),
    api('/api/stats/artist-year-span?limit=10').catch(() => []),
  ]);

  // A year ago today
  const yearAgoEl = document.getElementById('year-ago-list');
  if (yearAgoEl) {
    const dateLabel = new Date(Date.now() - 365 * 24 * 3600 * 1000).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('year-ago-label').textContent = `Around ${dateLabel}`;
    yearAgoEl.innerHTML = yearAgo.length
      ? yearAgo.map(t => `<div class="recent-item">
          ${t.album_art_url ? `<img class="recent-art" src="${esc(t.album_art_url)}" alt="" loading="lazy" />` : `<div class="recent-art" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-muted)">♪</div>`}
          <div class="recent-info">
            <div class="recent-name">${esc(t.track_name)}</div>
            <div class="recent-sub">${esc(t.artist_name)}</div>
          </div>
          <span class="recent-time">${formatDate(t.played_at)}</span>
        </div>`).join('')
      : emptyState('Nothing found around this date last year');
  }

  // Late night report
  const lnEl = document.getElementById('late-night-list');
  if (lnEl) {
    document.getElementById('late-night-total').textContent =
      lateNight.total ? `${Number(lateNight.total).toLocaleString()} plays between midnight and 4am` : '';
    lnEl.innerHTML = lateNight.plays.length
      ? lateNight.plays.map((t, i) => topItem(i + 1, t.track_name, t.artist_name, t.count, t.album_art_url, 'plays')).join('')
      : emptyState('No late-night plays recorded');
  }

  // Single day records
  const sdEl = document.getElementById('single-day-list');
  if (sdEl) {
    sdEl.innerHTML = singleDay.length
      ? singleDay.map((t, i) => `<div class="top-item">
          <span class="top-rank">${i + 1}</span>
          ${t.album_art_url ? `<img class="top-art" src="${esc(t.album_art_url)}" alt="" loading="lazy" />` : `<div class="top-art-placeholder">♪</div>`}
          <div class="top-info">
            <div class="top-name">${esc(t.track_name)}</div>
            <div class="top-sub">${esc(t.artist_name)} · ${t.date}</div>
          </div>
          <span class="top-count">${t.count}<span class="top-count-label"> times</span></span>
        </div>`).join('')
      : emptyState('No data yet');
  }

  // Artist year span
  const ysEl = document.getElementById('artist-year-span-list');
  if (ysEl) {
    ysEl.innerHTML = yearSpan.length
      ? yearSpan.map((a, i) => `<div class="top-item">
          <span class="top-rank">${i + 1}</span>
          <div class="top-art-placeholder">🎤</div>
          <div class="top-info">
            <div class="top-name">${esc(a.artist_name)}</div>
            <div class="top-sub">${a.first_year} – ${a.last_year} · ${Number(a.total_plays).toLocaleString()} plays</div>
          </div>
          <span class="top-count">${a.year_count}<span class="top-count-label"> yrs</span></span>
        </div>`).join('')
      : emptyState('No data yet');
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

async function startImport() {
  const fileInput = document.getElementById('import-files');
  const enrich = document.getElementById('import-enrich').checked;
  const progress = document.getElementById('import-progress');

  if (!fileInput.files.length) {
    showFeedback('import-feedback', false, 'Please select at least one JSON file');
    return;
  }

  if (importSse) importSse.close();
  importSse = new EventSource('/api/import/progress');
  progress.style.display = 'block';
  document.getElementById('import-feedback').className = 'feedback';

  importSse.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.phase === 'counting') {
      document.getElementById('import-label').textContent = `Counting… ${data.total} total records`;
    } else if (data.phase === 'importing') {
      document.getElementById('import-bar').style.width = `${data.percent}%`;
      document.getElementById('import-label').textContent =
        `Importing… ${data.inserted} inserted, ${data.skipped} skipped (${data.percent}%)`;
    } else if (data.phase === 'done') {
      document.getElementById('import-bar').style.width = '100%';
      document.getElementById('import-label').textContent = '';
      showFeedback('import-feedback', true, `Done — ${data.inserted} tracks inserted, ${data.skipped} duplicates skipped`);
      importSse.close();
      progress.style.display = 'none';
      loadGeneralTab();
    } else if (data.phase === 'error') {
      showFeedback('import-feedback', false, `Import error: ${data.message}`);
      importSse.close();
      progress.style.display = 'none';
    }
  };

  importSse.onerror = () => importSse.close();

  await new Promise(r => setTimeout(r, 300));

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

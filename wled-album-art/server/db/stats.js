const { getPool } = require('./client');

// Returns a safe SQL interval string or null for alltime
function periodInterval(period) {
  const map = { week: '7 days', month: '30 days', year: '365 days' };
  return map[period] || null;
}

// Returns an AND clause for the period, or empty string for alltime
function periodClause(period) {
  const interval = periodInterval(period);
  if (!interval) return '';
  return `AND played_at >= NOW() - INTERVAL '${interval}'`;
}

async function getSummary(period = 'alltime') {
  const pool = getPool();
  if (!pool) return null;

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                            AS total_plays,
       COALESCE(SUM(duration_ms), 0)       AS total_ms,
       COUNT(DISTINCT COALESCE(track_id, track_name)) AS unique_tracks,
       COUNT(DISTINCT COALESCE(artist_id, artist_name)) AS unique_artists,
       MIN(played_at)                      AS first_play,
       MAX(played_at)                      AS last_play
     FROM plays WHERE 1=1 ${where}`
  );
  return rows[0];
}

async function getTopTracks(period = 'alltime', limit = 10) {
  const pool = getPool();
  if (!pool) return [];

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT track_id, track_name, artist_name, album_art_url,
            COUNT(*) AS play_count,
            COALESCE(SUM(duration_ms), 0) AS total_ms
     FROM plays WHERE 1=1 ${where}
     GROUP BY track_id, track_name, artist_name, album_art_url
     ORDER BY play_count DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getTopArtists(period = 'alltime', limit = 10) {
  const pool = getPool();
  if (!pool) return [];

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT artist_id, artist_name,
            COUNT(*) AS play_count,
            COALESCE(SUM(duration_ms), 0) AS total_ms
     FROM plays WHERE 1=1 ${where}
     GROUP BY artist_id, artist_name
     ORDER BY play_count DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getDailyPlayCounts(period = 'month') {
  const pool = getPool();
  if (!pool) return [];

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT DATE(played_at)::text AS date, COUNT(*) AS count
     FROM plays WHERE 1=1 ${where}
     GROUP BY date ORDER BY date`
  );
  return rows.map((r) => ({ date: r.date, count: parseInt(r.count, 10) }));
}

async function getPlaysByHour(period = 'alltime') {
  const pool = getPool();
  if (!pool) return [];

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT EXTRACT(HOUR FROM played_at)::int AS hour, COUNT(*) AS count
     FROM plays WHERE 1=1 ${where}
     GROUP BY hour ORDER BY hour`
  );

  const result = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  for (const row of rows) result[row.hour].count = parseInt(row.count, 10);
  return result;
}

async function getPlaysByDayOfWeek(period = 'alltime') {
  const pool = getPool();
  if (!pool) return [];

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT EXTRACT(DOW FROM played_at)::int AS dow, COUNT(*) AS count
     FROM plays WHERE 1=1 ${where}
     GROUP BY dow ORDER BY dow`
  );

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result = days.map((d, i) => ({ day: d, dow: i, count: 0 }));
  for (const row of rows) result[row.dow].count = parseInt(row.count, 10);
  return result;
}

async function getListeningTime(period = 'alltime') {
  const pool = getPool();
  if (!pool) return 0;

  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(duration_ms), 0) AS total FROM plays WHERE 1=1 ${where}`
  );
  return parseInt(rows[0].total, 10);
}

async function getListeningDateRange() {
  const pool = getPool();
  if (!pool) return { first: null, last: null };

  const { rows } = await pool.query(
    'SELECT MIN(played_at) AS first, MAX(played_at) AS last FROM plays'
  );
  return rows[0];
}

module.exports = {
  getSummary,
  getTopTracks,
  getTopArtists,
  getDailyPlayCounts,
  getPlaysByHour,
  getPlaysByDayOfWeek,
  getListeningTime,
  getListeningDateRange,
};

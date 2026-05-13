const { getPool } = require('./client');

function periodInterval(period) {
  const map = { week: '7 days', month: '30 days', year: '365 days' };
  return map[period] || null;
}

function periodClause(period) {
  const interval = periodInterval(period);
  if (!interval) return '';
  return `AND played_at >= NOW() - INTERVAL '${interval}'`;
}

// ── Existing ──────────────────────────────────────────────────────────────────

async function getSummary(period = 'alltime') {
  const pool = getPool();
  if (!pool) return null;
  const where = periodClause(period);
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                              AS total_plays,
       COALESCE(SUM(duration_ms), 0)                        AS total_ms,
       COUNT(DISTINCT COALESCE(track_id, track_name))       AS unique_tracks,
       COUNT(DISTINCT COALESCE(artist_id, artist_name))     AS unique_artists,
       MIN(played_at)                                       AS first_play,
       MAX(played_at)                                       AS last_play
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
     ORDER BY play_count DESC LIMIT $1`,
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
     ORDER BY play_count DESC LIMIT $1`,
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

// ── Behavior ──────────────────────────────────────────────────────────────────

// Gap-based session detection: 30+ min silence = new session
async function getSessionStats() {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(`
    WITH ordered AS (
      SELECT played_at,
             played_at - LAG(played_at) OVER (ORDER BY played_at) AS gap
      FROM plays
    ),
    boundaries AS (
      SELECT played_at,
             CASE WHEN gap IS NULL OR gap > INTERVAL '30 minutes' THEN 1 ELSE 0 END AS new_sess
      FROM ordered
    ),
    numbered AS (
      SELECT played_at,
             SUM(new_sess) OVER (ORDER BY played_at ROWS UNBOUNDED PRECEDING) AS sess_num
      FROM boundaries
    ),
    sessions AS (
      SELECT sess_num,
             MIN(played_at) AS start_at,
             MAX(played_at) AS end_at,
             COUNT(*) AS track_count,
             ROUND(EXTRACT(EPOCH FROM (MAX(played_at) - MIN(played_at))) / 60) AS dur_min
      FROM numbered
      GROUP BY sess_num
    )
    SELECT
      COUNT(*)::int                             AS total_sessions,
      ROUND(AVG(dur_min))::int                  AS avg_duration_min,
      MAX(dur_min)::int                         AS longest_duration_min,
      (SELECT track_count FROM sessions ORDER BY dur_min DESC LIMIT 1) AS longest_track_count,
      (SELECT start_at   FROM sessions ORDER BY dur_min DESC LIMIT 1) AS longest_start,
      (SELECT end_at     FROM sessions ORDER BY dur_min DESC LIMIT 1) AS longest_end
    FROM sessions
  `);
  return rows[0] || null;
}

async function getStreaks() {
  const pool = getPool();
  if (!pool) return { current: 0, longest: 0, longestStart: null, longestEnd: null };
  const { rows } = await pool.query(`
    WITH daily AS (
      SELECT DISTINCT DATE(played_at) AS d FROM plays
    ),
    grouped AS (
      SELECT d,
             d - ROW_NUMBER() OVER (ORDER BY d)::int AS grp
      FROM daily
    ),
    streaks AS (
      SELECT MIN(d) AS start_d, MAX(d) AS end_d, COUNT(*)::int AS len
      FROM grouped GROUP BY grp
    )
    SELECT
      MAX(len)                                                       AS longest,
      (SELECT start_d FROM streaks ORDER BY len DESC LIMIT 1)       AS longest_start,
      (SELECT end_d   FROM streaks ORDER BY len DESC LIMIT 1)       AS longest_end,
      COALESCE((
        SELECT len FROM streaks
        WHERE end_d >= CURRENT_DATE - INTERVAL '1 day'
        ORDER BY end_d DESC LIMIT 1
      ), 0)                                                          AS current
    FROM streaks
  `);
  return rows[0] || { current: 0, longest: 0 };
}

async function getTopDays(limit = 10) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT DATE(played_at)::text AS date, COUNT(*) AS count
     FROM plays
     GROUP BY date
     ORDER BY count DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ date: r.date, count: parseInt(r.count, 10) }));
}

// Most active single hour across all history
async function getMostActiveHour() {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(`
    SELECT EXTRACT(HOUR FROM played_at)::int AS hour, COUNT(*) AS count
    FROM plays
    GROUP BY hour
    ORDER BY count DESC
    LIMIT 1
  `);
  return rows[0] || null;
}

// ── Deep Dive ─────────────────────────────────────────────────────────────────

async function getFirstPlay() {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    'SELECT * FROM plays ORDER BY played_at ASC LIMIT 1'
  );
  return rows[0] || null;
}

// Artists you only ever played once
async function getOneHitWonders(limit = 20) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT artist_name, track_name, album_art_url, MIN(played_at) AS played_at
     FROM plays
     GROUP BY artist_name, track_name, album_art_url
     HAVING COUNT(*) = 1
       AND artist_name NOT IN (
         SELECT artist_name FROM plays
         GROUP BY artist_name HAVING COUNT(*) > 1
       )
     ORDER BY played_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Available calendar years with play data
async function getAvailableYears() {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT EXTRACT(YEAR FROM played_at)::int AS year
     FROM plays ORDER BY year DESC`
  );
  return rows.map((r) => r.year);
}

// Top tracks and artists for a given calendar year
async function getYearInReview(year) {
  const pool = getPool();
  if (!pool) return { tracks: [], artists: [] };
  const [tracksRes, artistsRes] = await Promise.all([
    pool.query(
      `SELECT track_name, artist_name, album_art_url,
              COUNT(*) AS play_count
       FROM plays
       WHERE EXTRACT(YEAR FROM played_at) = $1
       GROUP BY track_name, artist_name, album_art_url
       ORDER BY play_count DESC LIMIT 10`,
      [year]
    ),
    pool.query(
      `SELECT artist_name, COUNT(*) AS play_count,
              COALESCE(SUM(duration_ms), 0) AS total_ms
       FROM plays
       WHERE EXTRACT(YEAR FROM played_at) = $1
       GROUP BY artist_name
       ORDER BY play_count DESC LIMIT 10`,
      [year]
    ),
  ]);
  return { tracks: tracksRes.rows, artists: artistsRes.rows };
}

// Same track played multiple times in the same session
async function getBackToBackReplays(limit = 10) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(`
    WITH ordered AS (
      SELECT track_name, artist_name, album_art_url, played_at,
             played_at - LAG(played_at) OVER (ORDER BY played_at) AS gap,
             CASE WHEN track_name = LAG(track_name) OVER (ORDER BY played_at) THEN 1 ELSE 0 END AS is_repeat
      FROM plays
    ),
    runs AS (
      SELECT track_name, artist_name, album_art_url, played_at, is_repeat,
             SUM(CASE WHEN is_repeat = 0 THEN 1 ELSE 0 END) OVER (ORDER BY played_at ROWS UNBOUNDED PRECEDING) AS run_id
      FROM ordered
    ),
    counted AS (
      SELECT track_name, artist_name, album_art_url, MIN(played_at) AS first_at,
             COUNT(*) AS repeat_count
      FROM runs
      GROUP BY run_id, track_name, artist_name, album_art_url
      HAVING COUNT(*) > 1
    )
    SELECT * FROM counted ORDER BY repeat_count DESC LIMIT $1
  `, [limit]);
  return rows;
}

// ── Time Patterns ─────────────────────────────────────────────────────────────

async function getSeasonalTrends() {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(`
    SELECT
      EXTRACT(YEAR FROM played_at)::int AS year,
      CASE
        WHEN EXTRACT(MONTH FROM played_at) IN (12,1,2)  THEN 'Winter'
        WHEN EXTRACT(MONTH FROM played_at) IN (3,4,5)   THEN 'Spring'
        WHEN EXTRACT(MONTH FROM played_at) IN (6,7,8)   THEN 'Summer'
        ELSE 'Fall'
      END AS season,
      COUNT(*) AS count,
      COALESCE(SUM(duration_ms), 0) AS total_ms
    FROM plays
    GROUP BY year, season
    ORDER BY year DESC, MIN(EXTRACT(MONTH FROM played_at))
  `);
  return rows;
}

// Top artist per calendar year
async function getTopArtistPerYear() {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(`
    WITH yearly AS (
      SELECT EXTRACT(YEAR FROM played_at)::int AS year,
             artist_name,
             COUNT(*) AS play_count,
             ROW_NUMBER() OVER (
               PARTITION BY EXTRACT(YEAR FROM played_at)
               ORDER BY COUNT(*) DESC
             ) AS rn
      FROM plays
      GROUP BY year, artist_name
    )
    SELECT year, artist_name, play_count
    FROM yearly WHERE rn = 1
    ORDER BY year DESC
  `);
  return rows;
}

// ── Fun ───────────────────────────────────────────────────────────────────────

// Plays from this date last year (±3 days window)
async function getAYearAgoToday() {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(`
    SELECT track_name, artist_name, album_art_url, played_at
    FROM plays
    WHERE DATE(played_at) BETWEEN
      CURRENT_DATE - INTERVAL '1 year' - INTERVAL '3 days' AND
      CURRENT_DATE - INTERVAL '1 year' + INTERVAL '3 days'
    ORDER BY played_at DESC
    LIMIT 20
  `);
  return rows;
}

// Late night (midnight–4am) top tracks
async function getLateNightReport(limit = 10) {
  const pool = getPool();
  if (!pool) return { plays: [], total: 0 };
  const [tracksRes, countRes] = await Promise.all([
    pool.query(
      `SELECT track_name, artist_name, album_art_url, COUNT(*) AS count
       FROM plays
       WHERE EXTRACT(HOUR FROM played_at) BETWEEN 0 AND 3
       GROUP BY track_name, artist_name, album_art_url
       ORDER BY count DESC LIMIT $1`,
      [limit]
    ),
    pool.query(
      `SELECT COUNT(*) AS total FROM plays WHERE EXTRACT(HOUR FROM played_at) BETWEEN 0 AND 3`
    ),
  ]);
  return {
    plays: tracksRes.rows,
    total: parseInt(countRes.rows[0].total, 10),
  };
}

// Most times a single track played in one day
async function getMostPlayedInOneDay(limit = 10) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT track_name, artist_name, album_art_url,
            DATE(played_at)::text AS date,
            COUNT(*) AS count
     FROM plays
     GROUP BY track_name, artist_name, album_art_url, DATE(played_at)
     ORDER BY count DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Artists you've listened to across the most different calendar years
async function getArtistYearSpan(limit = 10) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT artist_name,
            COUNT(DISTINCT EXTRACT(YEAR FROM played_at))::int AS year_count,
            MIN(EXTRACT(YEAR FROM played_at))::int            AS first_year,
            MAX(EXTRACT(YEAR FROM played_at))::int            AS last_year,
            COUNT(*) AS total_plays
     FROM plays
     GROUP BY artist_name
     ORDER BY year_count DESC, total_plays DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// Work (9-17 weekday) vs late night (0-3) vs weekend morning (8-11 Sat/Sun)
async function getListeningTimeSlots() {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM played_at) BETWEEN 0 AND 3   THEN 'Late Night'
        WHEN EXTRACT(HOUR FROM played_at) BETWEEN 9 AND 17
          AND EXTRACT(DOW FROM played_at) BETWEEN 1 AND 5   THEN 'Work Hours'
        WHEN EXTRACT(HOUR FROM played_at) BETWEEN 8 AND 11
          AND EXTRACT(DOW FROM played_at) IN (0,6)          THEN 'Weekend Morning'
        WHEN EXTRACT(HOUR FROM played_at) BETWEEN 18 AND 23 THEN 'Evening'
        ELSE 'Other'
      END AS slot,
      COUNT(*) AS count,
      COALESCE(SUM(duration_ms), 0) AS total_ms
    FROM plays
    GROUP BY slot
    ORDER BY count DESC
  `);
  return rows;
}

async function getTopAlbums(limit = 10) {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT album_name, album_id, artist_name,
            MAX(album_art_url) AS album_art_url,
            COUNT(*) AS play_count
     FROM plays
     WHERE album_name IS NOT NULL AND album_art_url IS NOT NULL
     GROUP BY album_name, album_id, artist_name
     ORDER BY play_count DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
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
  // Behavior
  getSessionStats,
  getStreaks,
  getTopDays,
  getMostActiveHour,
  // Deep Dive
  getFirstPlay,
  getOneHitWonders,
  getAvailableYears,
  getYearInReview,
  getBackToBackReplays,
  // Time Patterns
  getSeasonalTrends,
  getTopArtistPerYear,
  // Fun
  getAYearAgoToday,
  getLateNightReport,
  getMostPlayedInOneDay,
  getArtistYearSpan,
  getListeningTimeSlots,
  getTopAlbums,
};

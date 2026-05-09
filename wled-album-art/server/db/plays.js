const { getPool } = require('./client');

async function insertPlay(data) {
  const pool = getPool();
  if (!pool) return null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO plays
        (played_at, track_id, track_name, artist_id, artist_name,
         album_id, album_name, album_art_url, duration_ms, spotify_uri,
         source, import_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (artist_name, track_name, played_at) DO NOTHING
       RETURNING id`,
      [
        data.played_at || new Date(),
        data.track_id || null,
        data.track_name,
        data.artist_id || null,
        data.artist_name,
        data.album_id || null,
        data.album_name || null,
        data.album_art_url || null,
        data.duration_ms || null,
        data.spotify_uri || null,
        data.source || 'live',
        data.import_batch_id || null,
      ]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[db] insertPlay error:', err.message);
    return null;
  }
}

async function getRecentPlays(limit = 50, offset = 0) {
  const pool = getPool();
  if (!pool) return [];

  const { rows } = await pool.query(
    'SELECT * FROM plays ORDER BY played_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return rows;
}

async function getPlaysByDateRange(startDate, endDate) {
  const pool = getPool();
  if (!pool) return [];

  const { rows } = await pool.query(
    'SELECT * FROM plays WHERE played_at BETWEEN $1 AND $2 ORDER BY played_at DESC',
    [startDate, endDate]
  );
  return rows;
}

async function getTotalPlayCount() {
  const pool = getPool();
  if (!pool) return 0;

  const { rows } = await pool.query('SELECT COUNT(*) as count FROM plays');
  return parseInt(rows[0].count, 10);
}

async function getTotalListeningMs() {
  const pool = getPool();
  if (!pool) return 0;

  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(duration_ms), 0) as total FROM plays'
  );
  return parseInt(rows[0].total, 10);
}

module.exports = {
  insertPlay,
  getRecentPlays,
  getPlaysByDateRange,
  getTotalPlayCount,
  getTotalListeningMs,
};

const axios = require('axios');
const { getPool } = require('../db/client');
const { insertPlay } = require('../db/plays');
const { getValidAccessToken } = require('../spotify/auth');

async function importSpotifyExport(files, options = {}, onProgress) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const { enrich = false } = options;
  const enrichCache = new Map();

  // Parse all files and count totals
  const parsedFiles = files.map((f) => JSON.parse(f.buffer.toString('utf8')));
  const totalRecords = parsedFiles.reduce((sum, arr) => sum + arr.length, 0);

  onProgress({ phase: 'counting', total: totalRecords, inserted: 0, skipped: 0, percent: 0 });

  // Create import batch record
  const batchRes = await pool.query(
    `INSERT INTO import_batches (filename, records_total, records_inserted)
     VALUES ($1, $2, 0) RETURNING id`,
    [files.map((f) => f.originalname).join(', '), totalRecords]
  );
  const batchId = batchRes.rows[0].id;

  let processed = 0;
  let insertedRecords = 0;
  let dateMin = null;
  let dateMax = null;
  let enrichQueue = [];

  for (const records of parsedFiles) {
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const playedAt = new Date(record.endTime);

      if (!dateMin || playedAt < dateMin) dateMin = playedAt;
      if (!dateMax || playedAt > dateMax) dateMax = playedAt;

      let enriched = {};
      if (enrich) {
        const cacheKey = `${record.artistName}|||${record.trackName}`;
        if (!enrichCache.has(cacheKey)) {
          enrichQueue.push({ cacheKey, artistName: record.artistName, trackName: record.trackName });
        }
        if (enrichQueue.length >= 5 || i === records.length - 1) {
          await enrichBatch(enrichQueue, enrichCache);
          enrichQueue = [];
        }
        enriched = enrichCache.get(cacheKey) || {};
      }

      const result = await insertPlay({
        played_at: playedAt,
        track_id: enriched.track_id || null,
        track_name: record.trackName,
        artist_id: enriched.artist_id || null,
        artist_name: record.artistName,
        album_id: enriched.album_id || null,
        album_name: enriched.album_name || null,
        album_art_url: enriched.album_art_url || null,
        duration_ms: record.msPlayed || null,
        spotify_uri: enriched.spotify_uri || null,
        source: 'import',
        import_batch_id: batchId,
      });

      if (result) insertedRecords++;
      processed++;

      if (processed % 100 === 0 || processed === totalRecords) {
        onProgress({
          phase: 'importing',
          total: totalRecords,
          inserted: insertedRecords,
          skipped: processed - insertedRecords,
          percent: Math.round((processed / totalRecords) * 100),
        });
      }
    }
  }

  await pool.query(
    `UPDATE import_batches
     SET records_inserted = $1, date_range_start = $2, date_range_end = $3
     WHERE id = $4`,
    [insertedRecords, dateMin, dateMax, batchId]
  );

  return {
    batchId,
    total: totalRecords,
    inserted: insertedRecords,
    skipped: totalRecords - insertedRecords,
    dateRangeStart: dateMin,
    dateRangeEnd: dateMax,
  };
}

async function enrichBatch(batch, cache) {
  let token;
  try {
    token = await getValidAccessToken();
  } catch {
    for (const item of batch) {
      if (!cache.has(item.cacheKey)) cache.set(item.cacheKey, {});
    }
    return;
  }

  for (const item of batch) {
    if (cache.has(item.cacheKey)) continue;
    try {
      const q = encodeURIComponent(`track:${item.trackName} artist:${item.artistName}`);
      const res = await axios.get(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const track = res.data?.tracks?.items?.[0];
      cache.set(item.cacheKey, track ? {
        track_id: track.id,
        artist_id: track.artists[0]?.id || null,
        album_id: track.album?.id || null,
        album_name: track.album?.name || null,
        album_art_url: track.album?.images?.[0]?.url || null,
        spotify_uri: track.uri || null,
      } : {});
    } catch {
      cache.set(item.cacheKey, {});
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

module.exports = { importSpotifyExport };

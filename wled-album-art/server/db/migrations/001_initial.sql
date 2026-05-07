CREATE TABLE IF NOT EXISTS plays (
  id              SERIAL PRIMARY KEY,
  played_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  track_id        VARCHAR(64),
  track_name      VARCHAR(512) NOT NULL,
  artist_id       VARCHAR(64),
  artist_name     VARCHAR(512) NOT NULL,
  album_id        VARCHAR(64),
  album_name      VARCHAR(512),
  album_art_url   TEXT,
  duration_ms     INTEGER,
  spotify_uri     VARCHAR(256),
  source          VARCHAR(32) DEFAULT 'live',
  import_batch_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plays_played_at  ON plays (played_at DESC);
CREATE INDEX IF NOT EXISTS idx_plays_track_id   ON plays (track_id);
CREATE INDEX IF NOT EXISTS idx_plays_artist_id  ON plays (artist_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plays_dedup
  ON plays (artist_name, track_name, played_at);

CREATE TABLE IF NOT EXISTS import_batches (
  id                SERIAL PRIMARY KEY,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename          VARCHAR(256),
  records_total     INTEGER,
  records_inserted  INTEGER,
  date_range_start  TIMESTAMPTZ,
  date_range_end    TIMESTAMPTZ
);

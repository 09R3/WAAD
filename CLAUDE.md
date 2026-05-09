# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `wled-album-art/`:

```bash
# Install dependencies
npm install

# Run (production)
npm start

# Run with file-watch auto-restart (development)
npm run dev

# Docker
docker compose up -d --build   # build and start
docker logs wled-album-art      # tail container logs
docker compose down             # stop
```

There is no test suite or linter configured. Syntax-check individual files with:
```bash
node --check server/<path>.js
```

## Architecture

The app is a single Express process (`server/index.js`) that wires together four independent subsystems via a shared config store and Node EventEmitter.

### Data flow on track change

```
Spotify Poller (interval)
  → onTrackChange callback (index.js)
    → image/fetcher.js   — downloads album art JPEG (cached by track ID)
    → image/processor.js — sharp lanczos3 resize → raw RGB buffer
    → image/dither.js    — Floyd-Steinberg or nearest-neighbor (pure functions)
    → brightness scale   — inline in index.js, multiplied per-pixel
    → wled/ddp.js        — UDP DDP packet to WLED
    → db/plays.js        — INSERT play record (skipped if DB not configured)
    → routes/api.js      — SSE broadcast to all connected browsers
```

### Config hot-reload

`server/config/store.js` is the single source of truth for both `data/settings.json` (runtime config) and `.env` (Spotify credentials). It emits a `'changed'` event on every write. The poller (`spotify/poller.js`) listens and restarts its interval automatically — no process restart needed when settings change via the UI.

The `lastPixels` buffer is a module-level variable in `routes/api.js`, set by `index.js` after every successful image pipeline run. `/api/preview` and `/api/test-push` both read from this shared state.

### DDP packet format

The WLED DDP header is 10 bytes: `[0x41, 0x00, 0x01, 0x01, offset(4 BE), length(2 BE)]` followed by raw `R,G,B` bytes. Full frame is always sent as a single UDP packet — no chunking for small matrices.

### Frontend

Vanilla JS, no build step. Four script files loaded in order: `settings.js` (form helpers, load/save, modal), `preview.js` (canvas renderer), `stats.js` (stats page logic + Chart.js), `app.js` (SSE client, now-playing updates, page nav, init). The canvas renderer supports two modes — smooth (bilinear via offscreen canvas scale) and pixel (rounded rectangles per LED with gap).

SSE events from `/api/stream` drive all real-time UI updates; the browser does not poll. A second SSE endpoint `/api/import/progress` streams progress during Spotify export imports.

### Key file locations

| Concern | File |
|---|---|
| App wiring + pipeline | `server/index.js` |
| Config read/write + events | `server/config/store.js` |
| Spotify token lifecycle | `server/spotify/auth.js` |
| Track polling loop | `server/spotify/poller.js` |
| DDP UDP client | `server/wled/ddp.js` |
| REST + SSE endpoints | `server/routes/api.js` |
| OAuth redirect handlers | `server/routes/auth.js` |
| Dither algorithms (pure) | `server/image/dither.js` |
| DB connection pool | `server/db/client.js` |
| Play record insert/query | `server/db/plays.js` |
| Aggregation queries | `server/db/stats.js` |
| Schema migrations | `server/db/migrations/001_initial.sql` |
| Spotify export importer | `server/import/spotify-export.js` |
| Stats + import API routes | `server/routes/stats.js` |

### Persistent data

`data/settings.json` is the only file written at runtime and is volume-mounted in Docker (`./data:/app/data`). The `.env` file is also rewritten in-place by the credentials API — `process.env` is updated immediately so no restart is required.

## Database module (optional)

The DB module is fully optional. If `DB_HOST` is not set in `.env`, all DB calls are silently skipped and the rest of the app works normally.

When configured, a PostgreSQL container runs alongside the app container on a shared `wled-net` Docker network. The app connects to it as `DB_HOST=postgres`. Migrations in `server/db/migrations/001_initial.sql` run automatically on startup using `CREATE TABLE IF NOT EXISTS` — safe to re-run.

### Schema

Two tables:
- **`plays`** — one row per track change event. `source` is `'live'` for polled plays, `'import'` for imported ones. Has a unique index on `(artist_name, track_name, played_at)` for idempotent imports.
- **`import_batches`** — one row per Spotify export import run, tracks filename, record counts, and date range.

### Stats page

The Stats tab in the UI is lazy-loaded on first click. It shows:
- Summary bar (total plays, listening time, unique tracks/artists, date range)
- Period tabs: 7 days / 30 days / 12 months / all time
- Top 10 tracks and artists (by play count)
- Listening trend line chart (daily play counts via Chart.js CDN)
- Patterns bar charts (plays by hour of day, plays by day of week)
- Recent plays feed with pagination
- Spotify export import (multipart file upload, optional Spotify API enrichment, SSE progress)

### Spotify export import

Spotify's GDPR data export produces `StreamingHistory_music_N.json` files containing `{endTime, artistName, trackName, msPlayed}` records. The importer deduplicates via `ON CONFLICT DO NOTHING` on the unique index. Optional enrichment batch-queries the Spotify search API (5 at a time, 100ms delay) to fill in missing track IDs, album names, and album art URLs.

### `.env` additions for DB

```
DB_USER=wled
DB_PASSWORD=yourpasswordhere
DB_NAME=listening_history
DB_HOST=postgres
DB_PORT=5432
```

On Unraid, point the `pgdata` volume mount to `/mnt/user/appdata/wled-album-art/pgdata`.

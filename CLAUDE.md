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
    → routes/api.js      — SSE broadcast to all connected browsers
```

### Config hot-reload

`server/config/store.js` is the single source of truth for both `data/settings.json` (runtime config) and `.env` (Spotify credentials). It emits a `'changed'` event on every write. The poller (`spotify/poller.js`) listens and restarts its interval automatically — no process restart needed when settings change via the UI.

The `lastPixels` buffer is a module-level variable in `routes/api.js`, set by `index.js` after every successful image pipeline run. `/api/preview` and `/api/test-push` both read from this shared state.

### DDP packet format

The WLED DDP header is 10 bytes: `[0x41, 0x00, 0x01, 0x01, offset(4 BE), length(2 BE)]` followed by raw `R,G,B` bytes. Full frame is always sent as a single UDP packet — no chunking for small matrices.

### Frontend

Vanilla JS, no build step. Three script files loaded in order: `settings.js` (form helpers, load/save), `preview.js` (canvas renderer), `app.js` (SSE client, now-playing updates, init). The canvas renderer supports two modes — smooth (bilinear via offscreen canvas scale) and pixel (rounded rectangles per LED with gap).

SSE events from `/api/stream` drive all real-time UI updates; the browser does not poll.

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

### Persistent data

`data/settings.json` is the only file written at runtime and is volume-mounted in Docker (`./data:/app/data`). The `.env` file is also rewritten in-place by the credentials API — `process.env` is updated immediately so no restart is required.

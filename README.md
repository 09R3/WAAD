# WAAD
WLED Album Art Display

---

# WLED Album Art Display

A self-hosted Node.js application that displays Spotify album art on an ESP32 LED matrix running WLED. Runs in Docker, includes a polished web UI for configuration, live matrix preview, and Spotify authentication.

---

## Preview

> *Screenshots can go here once the project is running*

---

## Features

- 🎵 Polls Spotify for currently playing track in real time
- 🖼️ Processes and dithers album art to match your matrix dimensions
- 💡 Streams pixel data to WLED via DDP protocol (UDP)
- 🔲 Live matrix preview in the browser — pixel accurate or smooth toggle
- ⚙️ Full settings UI — no manual config file editing required
- 🔐 Spotify OAuth flow handled entirely in the browser
- 🐳 Single Docker container, persistent config via volume mount

---

## Hardware Requirements

- ESP32 (any variant)
- WS2812B or compatible LED matrix
- Adequate 5V power supply for your matrix size
  - 16x16 (256 LEDs): ~15W recommended
  - 32x32 (1024 LEDs): ~50W recommended
- Data line level shifter recommended for 32x32 and larger

---

## Software Requirements

- Docker + Docker Compose
- Spotify account (free or premium)
- Spotify Developer app credentials ([create one here](https://developer.spotify.com/dashboard))
- ESP32 flashed with [WLED](https://install.wled.me/) and configured as a 2D matrix

---

## Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/wled-album-art.git
cd wled-album-art
```

### 2. Configure credentials
```bash
cp .env.example .env
```
Edit `.env` and add your Spotify app credentials:
```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://YOUR_UNRAID_IP:3000/auth/callback
SERVER_PORT=3000
```

### 3. Add the redirect URI to your Spotify app
In your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), open your app settings and add the redirect URI exactly as it appears in your `.env`.

### 4. Start the container
```bash
docker compose up -d
```

### 5. Open the web UI
Navigate to `http://YOUR_UNRAID_IP:3000` in your browser.

### 6. Connect Spotify
In the **Credentials** section, click **Connect Spotify** and complete the OAuth flow.

### 7. Configure your matrix
In **Settings**, enter your WLED IP address and set your matrix dimensions to match your physical hardware.

---

## WLED Setup

In the WLED web interface:

1. Go to **Config → LED Preferences**
2. Set your LED count to match your matrix (e.g. 256 for 16x16)
3. Go to **Config → 2D Configuration**
4. Set panel width and height to match your matrix dimensions
5. Note your WLED device IP — you'll enter this in the app settings

---

## Configuration

All settings are managed through the web UI at `http://YOUR_IP:3000`. No manual file editing required after initial setup.

| Setting | Description | Default |
|---|---|---|
| WLED IP | IP address of your WLED device | — |
| WLED Port | UDP port for DDP | 4048 |
| Matrix Width | LED columns | 16 |
| Matrix Height | LED rows | 16 |
| Brightness | LED brightness (0–255) | 128 |
| Polling Interval | How often Spotify is checked | 4s |
| Dithering | Enable/disable dithering | On |
| Dither Algorithm | Floyd-Steinberg or Nearest Neighbor | Floyd-Steinberg |

---

## Web UI

**Now Playing** — shows current track, artist, album art, and push status, updates automatically when the track changes.

**Matrix Preview** — live preview of what is being sent to the matrix. Toggle between:
- **Pixel view** — accurate representation of each LED as a colored square
- **Smooth view** — scaled up album art for easier viewing

**Settings** — all display and WLED configuration options.

**Credentials** — Spotify client ID, secret, and OAuth connection management.

---

## Docker Compose (Unraid)

If using Unraid's Docker UI instead of compose, configure the container with:

| Field | Value |
|---|---|
| Repository | wled-album-art |
| Port | 3000 → 3000 (TCP) |
| Volume | `/mnt/user/appdata/wled-album-art` → `/app/data` |
| Env | Add your Spotify credentials |

---

## Troubleshooting

**Spotify shows "not connected"**
Make sure the redirect URI in your `.env` exactly matches what is set in the Spotify Developer Dashboard, including the port.

**WLED not receiving data**
- Confirm your WLED device IP in settings
- Make sure WLED 2D matrix mode is configured and enabled
- Check that UDP port 4048 is not blocked on your network
- Use the **Test Push** button in the UI to manually trigger a push

**Album art not updating**
- Check the polling interval setting
- Verify Spotify is actively playing (not paused) — the API returns 204 when nothing is playing
- Check container logs: `docker logs wled-album-art`

**Image looks wrong on matrix**
- Confirm matrix width and height in settings match your physical hardware exactly
- Try toggling the dither algorithm — Floyd-Steinberg works better for photographic images, Nearest Neighbor can look better for high-contrast artwork

---

## Project Structure

```
wled-album-art/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── server/
│   ├── index.js
│   ├── spotify/
│   │   ├── auth.js
│   │   └── poller.js
│   ├── image/
│   │   ├── fetcher.js
│   │   ├── processor.js
│   │   └── dither.js
│   ├── wled/
│   │   └── ddp.js
│   ├── config/
│   │   └── store.js
│   └── routes/
│       ├── api.js
│       └── auth.js
└── public/
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js
        ├── preview.js
        └── settings.js
```

---

## Roadmap

- [ ] Apple Music support
- [ ] Idle screen / screensaver mode when nothing is playing
- [ ] Multiple WLED target support
- [ ] Custom color palette mapping
- [ ] Track metadata overlay option

---

## License

MIT

---

## Acknowledgements

- [WLED](https://github.com/Aircoookie/WLED) — the firmware that makes this possible
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — now playing and album art data

---

Just drop this in as `README.md` at the root of the repo. Once you have the project running, replace the preview placeholder with actual screenshots — a side-by-side of the web UI and the physical matrix would look great there.

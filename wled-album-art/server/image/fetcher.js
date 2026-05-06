const axios = require('axios');

let cachedTrackId = null;
let cachedBuffer = null;

async function fetchAlbumArt(url, trackId) {
  if (trackId && trackId === cachedTrackId && cachedBuffer) {
    return cachedBuffer;
  }
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  cachedTrackId = trackId || null;
  cachedBuffer = buffer;
  return buffer;
}

function clearCache() {
  cachedTrackId = null;
  cachedBuffer = null;
}

module.exports = { fetchAlbumArt, clearCache };

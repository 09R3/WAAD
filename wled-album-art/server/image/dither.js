// Pure functions — no side effects, no I/O

function nearestNeighbor(pixels, width, height) {
  // No dithering, just return the pixel array as-is
  return new Uint8Array(pixels);
}

function floydSteinberg(pixels, width, height) {
  const buf = new Float32Array(pixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;

      const oldR = buf[idx];
      const oldG = buf[idx + 1];
      const oldB = buf[idx + 2];

      const newR = Math.round(oldR / 255) * 255;
      const newG = Math.round(oldG / 255) * 255;
      const newB = Math.round(oldB / 255) * 255;

      buf[idx] = newR;
      buf[idx + 1] = newG;
      buf[idx + 2] = newB;

      const errR = oldR - newR;
      const errG = oldG - newG;
      const errB = oldB - newB;

      distributeError(buf, x + 1, y, width, height, errR, errG, errB, 7 / 16);
      distributeError(buf, x - 1, y + 1, width, height, errR, errG, errB, 3 / 16);
      distributeError(buf, x, y + 1, width, height, errR, errG, errB, 5 / 16);
      distributeError(buf, x + 1, y + 1, width, height, errR, errG, errB, 1 / 16);
    }
  }

  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(buf[i])));
  }
  return out;
}

function distributeError(buf, x, y, width, height, errR, errG, errB, factor) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 3;
  buf[idx] += errR * factor;
  buf[idx + 1] += errG * factor;
  buf[idx + 2] += errB * factor;
}

function applyDither(pixels, width, height, algorithm) {
  if (algorithm === 'floyd-steinberg') {
    return floydSteinberg(pixels, width, height);
  }
  return nearestNeighbor(pixels, width, height);
}

module.exports = { applyDither, floydSteinberg, nearestNeighbor };

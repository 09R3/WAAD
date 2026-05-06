const sharp = require('sharp');
const { applyDither } = require('./dither');

async function processImage(buffer, width, height, options = {}) {
  const { dithering = true, ditherAlgorithm = 'floyd-steinberg' } = options;

  const raw = await sharp(buffer)
    .resize(width, height, { kernel: 'lanczos3', fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();

  let pixels = new Uint8Array(raw);

  if (dithering) {
    pixels = applyDither(pixels, width, height, ditherAlgorithm);
  }

  return pixels;
}

// Convert flat Uint8Array [R,G,B,...] to array of {r,g,b} objects for API/preview
function pixelsToObjects(pixels) {
  const out = [];
  for (let i = 0; i < pixels.length; i += 3) {
    out.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
  }
  return out;
}

module.exports = { processImage, pixelsToObjects };

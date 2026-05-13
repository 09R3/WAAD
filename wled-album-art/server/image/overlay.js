// Tiny 3×5 pixel bitmap font for digits 0–9.
// Each row is a 3-bit mask where bit 2 = left column, bit 0 = right column.
const DIGIT_ROWS = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b011, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b001, 0b001, 0b001],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
};

const CHAR_W = 3;
const CHAR_H = 5;
const CHAR_GAP = 1;
const PAD = 1;

// Stamps the number n (1–99) onto a flat R,G,B pixel buffer in the bottom-right corner.
// The digits are white on a darkened background rectangle.
function drawNumber(pixels, width, height, n) {
  const str = String(n);
  const totalW = str.length * CHAR_W + (str.length - 1) * CHAR_GAP;

  // Bottom-right origin, 1px from each edge
  const x0 = width - totalW - PAD - 1;
  const y0 = height - CHAR_H - PAD - 1;

  // Darken the background rectangle
  for (let dy = -PAD; dy < CHAR_H + PAD; dy++) {
    for (let dx = -PAD; dx < totalW + PAD; dx++) {
      const px = x0 + dx;
      const py = y0 + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const idx = (py * width + px) * 3;
      pixels[idx]     = Math.round(pixels[idx]     * 0.25);
      pixels[idx + 1] = Math.round(pixels[idx + 1] * 0.25);
      pixels[idx + 2] = Math.round(pixels[idx + 2] * 0.25);
    }
  }

  // Draw white digit pixels
  for (let ci = 0; ci < str.length; ci++) {
    const rows = DIGIT_ROWS[str[ci]];
    if (!rows) continue;
    const cx = x0 + ci * (CHAR_W + CHAR_GAP);
    for (let row = 0; row < CHAR_H; row++) {
      for (let col = 0; col < CHAR_W; col++) {
        if (!((rows[row] >> (CHAR_W - 1 - col)) & 1)) continue;
        const px = cx + col;
        const py = y0 + row;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const idx = (py * width + px) * 3;
        pixels[idx]     = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
      }
    }
  }
}

module.exports = { drawNumber };

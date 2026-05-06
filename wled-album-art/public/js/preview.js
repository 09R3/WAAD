// Canvas renderer for the LED matrix preview

let previewMode = 'smooth';
let lastPixels = [];
let lastWidth = 16;
let lastHeight = 16;

function setPreviewMode(mode) {
  previewMode = mode;
  document.getElementById('btn-smooth').classList.toggle('active', mode === 'smooth');
  document.getElementById('btn-pixel').classList.toggle('active', mode === 'pixel');
  if (lastPixels.length > 0) {
    renderPreview(lastPixels, lastWidth, lastHeight);
  }
}

function renderPreview(pixels, matrixWidth, matrixHeight) {
  lastPixels = pixels;
  lastWidth = matrixWidth;
  lastHeight = matrixHeight;

  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');

  // Target display size — fill card width
  const cardWidth = canvas.parentElement.clientWidth - 2; // account for card padding
  const cellSize = Math.floor(cardWidth / matrixWidth);
  const gap = previewMode === 'pixel' ? Math.max(1, Math.floor(cellSize * 0.08)) : 0;

  const displayWidth = cellSize * matrixWidth;
  const displayHeight = cellSize * matrixHeight;

  canvas.width = displayWidth;
  canvas.height = displayHeight;

  if (previewMode === 'smooth') {
    renderSmooth(ctx, pixels, matrixWidth, matrixHeight, displayWidth, displayHeight);
  } else {
    renderPixel(ctx, pixels, matrixWidth, matrixHeight, cellSize, gap);
  }
}

function renderSmooth(ctx, pixels, matrixWidth, matrixHeight, displayWidth, displayHeight) {
  // Draw each pixel to a small offscreen canvas, then scale up with bilinear interpolation
  const offscreen = document.createElement('canvas');
  offscreen.width = matrixWidth;
  offscreen.height = matrixHeight;
  const offCtx = offscreen.getContext('2d');

  const imageData = offCtx.createImageData(matrixWidth, matrixHeight);
  for (let i = 0; i < pixels.length; i++) {
    imageData.data[i * 4] = pixels[i].r;
    imageData.data[i * 4 + 1] = pixels[i].g;
    imageData.data[i * 4 + 2] = pixels[i].b;
    imageData.data[i * 4 + 3] = 255;
  }
  offCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreen, 0, 0, displayWidth, displayHeight);
}

function renderPixel(ctx, pixels, matrixWidth, matrixHeight, cellSize, gap) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let y = 0; y < matrixHeight; y++) {
    for (let x = 0; x < matrixWidth; x++) {
      const px = pixels[y * matrixWidth + x];
      if (!px) continue;

      const { r, g, b } = px;
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      const drawX = x * cellSize + gap;
      const drawY = y * cellSize + gap;
      const drawSize = cellSize - gap * 2;

      // Rounded rectangle for LED look
      const radius = Math.max(1, drawSize * 0.2);
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, drawSize, drawSize, radius);
      ctx.fill();
    }
  }
}

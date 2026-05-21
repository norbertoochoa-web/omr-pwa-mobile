import { createCanvas } from 'canvas';

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.4}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OMR', size / 2, size / 2);

  const buffer = canvas.toBuffer('image/png');
  require('fs').writeFileSync(outputPath, buffer);
}

generateIcon(192, './icons/icon-192.png');
generateIcon(512, './icons/icon-512.png');
console.log('Icons generated');

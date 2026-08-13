// Run once: node scripts/generate-icons.mjs
// Requires sharp (already a Next.js dependency).
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

// Household piggy-bank mascot:
//   left ear  = round pig ear (you)
//   right ear = tall rabbit ear (her)
//   coin slot on top = piggy bank reference
function makeSvg(size) {
  const r = Math.round(size * 0.22);  // bg corner radius

  const cx = size * 0.5;
  const cy = size * 0.55;   // shift face down slightly so bunny ear fits
  const faceR = size * 0.30;

  const pink     = '#ffb3c6';
  const darkPink = '#ff85a1';
  const faceCol  = '#fff0f3';

  // Bunny ears — tall ovals, both sides
  const beOffX = faceR * 0.58;
  const beH    = size * 0.20;
  const beW    = size * 0.068;
  const beY    = cy - faceR - beH * 0.55;  // base overlaps face top edge

  // Coin slot
  const slotW = faceR * 0.55;
  const slotH = size * 0.024;
  const slotY = cy - faceR * 0.80;

  // Eyes
  const eyeR   = size * 0.036;
  const eyeOffX = faceR * 0.35;
  const eyeY   = cy - faceR * 0.12;

  // Snout
  const snW = faceR * 0.52;
  const snH = faceR * 0.30;
  const snY = cy + faceR * 0.50;
  const nR  = size * 0.024;
  const nX  = snW * 0.44;

  const f = n => n.toFixed(1);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#2563eb"/>

  <!-- Bunny ear (left) -->
  <ellipse cx="${f(cx - beOffX)}" cy="${f(beY)}" rx="${f(beW)}" ry="${f(beH)}" fill="${pink}"/>
  <ellipse cx="${f(cx - beOffX)}" cy="${f(beY)}" rx="${f(beW * 0.52)}" ry="${f(beH * 0.78)}" fill="${darkPink}"/>

  <!-- Bunny ear (right) -->
  <ellipse cx="${f(cx + beOffX)}" cy="${f(beY)}" rx="${f(beW)}" ry="${f(beH)}" fill="${pink}"/>
  <ellipse cx="${f(cx + beOffX)}" cy="${f(beY)}" rx="${f(beW * 0.52)}" ry="${f(beH * 0.78)}" fill="${darkPink}"/>

  <!-- Face -->
  <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(faceR)}" fill="${faceCol}"/>

  <!-- Coin slot -->
  <rect x="${f(cx - slotW / 2)}" y="${f(slotY - slotH / 2)}" width="${f(slotW)}" height="${f(slotH)}" rx="${f(slotH / 2)}" fill="#2563eb" opacity="0.45"/>

  <!-- Eyes -->
  <circle cx="${f(cx - eyeOffX)}" cy="${f(eyeY)}" r="${f(eyeR)}" fill="#1e293b"/>
  <circle cx="${f(cx + eyeOffX)}" cy="${f(eyeY)}" r="${f(eyeR)}" fill="#1e293b"/>
  <circle cx="${f(cx - eyeOffX + eyeR * 0.4)}" cy="${f(eyeY - eyeR * 0.4)}" r="${f(eyeR * 0.38)}" fill="white"/>
  <circle cx="${f(cx + eyeOffX + eyeR * 0.4)}" cy="${f(eyeY - eyeR * 0.4)}" r="${f(eyeR * 0.38)}" fill="white"/>

  <!-- Snout -->
  <ellipse cx="${f(cx)}" cy="${f(snY)}" rx="${f(snW)}" ry="${f(snH)}" fill="${pink}"/>
  <circle cx="${f(cx - nX)}" cy="${f(snY)}" r="${f(nR)}" fill="${darkPink}"/>
  <circle cx="${f(cx + nX)}" cy="${f(snY)}" r="${f(nR)}" fill="${darkPink}"/>
</svg>`;
}

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const nameMap = { 180: 'apple-touch-icon' };

for (const size of sizes) {
  const name = nameMap[size] ?? `icon-${size}`;
  const outPath = join(outDir, `${name}.png`);
  await sharp(Buffer.from(makeSvg(size)))
    .png()
    .toFile(outPath);
  console.log(`✓ ${name}.png (${size}x${size})`);
}

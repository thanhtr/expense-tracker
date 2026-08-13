// Run once: node scripts/generate-icons.mjs
// Requires sharp (already a Next.js dependency).
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

// Expense tracker icon: blue rounded square with a white wallet/chart motif
function makeSvg(size) {
  const r = Math.round(size * 0.2);  // corner radius
  const pad = Math.round(size * 0.18);
  const inner = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#2563eb"/>
  <!-- Bar chart bars -->
  <g fill="white" opacity="0.95">
    <!-- Short bar (left) -->
    <rect x="${pad}" y="${pad + Math.round(inner * 0.45)}" width="${Math.round(inner * 0.22)}" height="${Math.round(inner * 0.55)}" rx="${Math.round(size * 0.03)}"/>
    <!-- Medium bar (center) -->
    <rect x="${pad + Math.round(inner * 0.29)}" y="${pad + Math.round(inner * 0.22)}" width="${Math.round(inner * 0.22)}" height="${Math.round(inner * 0.78)}" rx="${Math.round(size * 0.03)}"/>
    <!-- Tall bar (right) -->
    <rect x="${pad + Math.round(inner * 0.58)}" y="${pad}" width="${Math.round(inner * 0.22)}" height="${inner}" rx="${Math.round(size * 0.03)}"/>
  </g>
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

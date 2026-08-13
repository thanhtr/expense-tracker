// Run once after updating scripts/icon-source.png:
//   node scripts/generate-icons.mjs
//
// To change the icon: drop a new icon-source.png (≥1024×1024) and re-run.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, 'icon-source.png');
const outDir = join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const nameMap = { 180: 'apple-touch-icon' };

for (const size of sizes) {
  const name = nameMap[size] ?? `icon-${size}`;
  const outPath = join(outDir, `${name}.png`);
  await sharp(readFileSync(src))
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`✓ ${name}.png (${size}x${size})`);
}

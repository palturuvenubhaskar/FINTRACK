import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const SVG_FILE = path.join(PUBLIC_DIR, 'favicon.svg');

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  const svgBuffer = fs.readFileSync(SVG_FILE);

  for (const size of sizes) {
    console.log(`Generating ${size}x${size}...`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(ICONS_DIR, `icon-${size}.png`));
  }

  // Generate maskable
  console.log(`Generating maskable 512x512...`);
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(ICONS_DIR, `icon-maskable-512.png`));

  // Generate favicons
  console.log(`Generating favicons...`);
  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(ICONS_DIR, `favicon-32.png`));
  await sharp(svgBuffer).resize(16, 16).png().toFile(path.join(ICONS_DIR, `favicon-16.png`));
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(ICONS_DIR, `apple-touch-icon.png`));

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);

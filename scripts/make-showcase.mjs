#!/usr/bin/env node
/**
 * Builds docs/showcase.webp — an auto-advancing slideshow of the screenshots
 * that slides sideways between views.
 *
 *   node scripts/make-showcase.mjs
 *
 * GitHub's README renderer strips scripts and styles, so a real carousel is
 * impossible there; an animated image is the only thing that moves. The
 * interactive version with dots and arrows lives in docs/index.html.
 *
 * Each slide is a single frame held for a long delay, followed by a handful of
 * short transition frames. That keeps the file small — a held frame costs
 * nothing extra compared to repeating it at the frame rate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = path.join(root, 'docs', 'screenshots');
const outFile = path.join(root, 'docs', 'showcase.webp');

/** Slide order, chosen to open on the view that explains the project fastest. */
const SLIDES = [
  '01-overview.png',
  '02-history.png',
  '06-discover.png',
  '03-live.png',
  '04-tools.png',
  '05-config.png',
];

const WIDTH = 1100;
const HOLD_MS = 2600;
const STEP_MS = 55;
const STEPS = 9; // transition frames between consecutive slides
const BACKGROUND = { r: 8, g: 9, b: 11, alpha: 1 };

/** Ease-in-out so the slide starts and ends gently instead of snapping. */
function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const files = SLIDES.filter((name) => fs.existsSync(path.join(shotsDir, name)));
if (files.length === 0) {
  console.error(`No screenshots found in ${shotsDir}`);
  process.exit(1);
}

// Normalize every screenshot to the same canvas — they were captured at
// slightly different heights.
const scaled = await Promise.all(
  files.map(async (name) => {
    const buf = await sharp(path.join(shotsDir, name)).resize({ width: WIDTH }).toBuffer();
    const meta = await sharp(buf).metadata();
    return { name, buf, height: meta.height };
  })
);

const HEIGHT = Math.max(...scaled.map((s) => s.height));

const slides = await Promise.all(
  scaled.map(async (s) =>
    sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 4, background: BACKGROUND },
    })
      .composite([{ input: s.buf, top: 0, left: 0 }])
      .png()
      .toBuffer()
  )
);

/** One frame of the sideways slide from `from` to `to`, at progress 0..1. */
async function transitionFrame(from, to, progress) {
  const shift = Math.round(ease(progress) * WIDTH);
  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: BACKGROUND },
  })
    .composite([
      { input: from, top: 0, left: -shift },
      { input: to, top: 0, left: WIDTH - shift },
    ])
    .png()
    .toBuffer();
}

const frames = [];
const delays = [];

for (let i = 0; i < slides.length; i++) {
  const current = slides[i];
  const next = slides[(i + 1) % slides.length];

  frames.push(current);
  delays.push(HOLD_MS);

  for (let step = 1; step <= STEPS; step++) {
    frames.push(await transitionFrame(current, next, step / (STEPS + 1)));
    delays.push(STEP_MS);
  }
}

await sharp(frames, { join: { animated: true } })
  .webp({ quality: 72, effort: 6, loop: 0, delay: delays })
  .toFile(outFile);

const { size } = fs.statSync(outFile);
console.log(
  `${outFile}  ${frames.length} frames  ${WIDTH}x${HEIGHT}  ${(size / 1024 / 1024).toFixed(2)} MB`
);

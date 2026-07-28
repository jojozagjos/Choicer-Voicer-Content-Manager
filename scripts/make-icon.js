'use strict';

/**
 * Turns assets/icon.svg into assets/icon.ico and assets/icon.png.
 *
 *   npx electron scripts/make-icon.js
 *
 * The icon is kept as an SVG because that is the version worth editing. This
 * renders it at every size Windows asks for and packs them into one .ico, so
 * the taskbar, the alt-tab switcher and Explorer each get a size drawn for
 * them rather than one bitmap scaled badly.
 *
 * Rendering happens in Electron because it is already a dependency and it has
 * a real browser engine in it; adding an SVG rasteriser just for this would be
 * another package to carry.
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, nativeImage } = require('electron');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icon.svg');
const ICO = path.join(ROOT, 'assets', 'icon.ico');
const PNG = path.join(ROOT, 'assets', 'icon.png');

// What Windows actually reaches for, smallest first.
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Packs PNGs into an .ico.
 *
 * The format is a small header, one 16 byte directory entry per image, then
 * the image payloads. Windows has accepted PNG payloads since Vista, which
 * avoids having to write BMP with its upside down rows and separate mask.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // 1 means icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;

  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    // 256 is stored as 0, since the field is a single byte.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);              // palette size, 0 for truecolour
    entry.writeUInt8(0, 3);              // reserved
    entry.writeUInt16LE(1, 4);           // colour planes
    entry.writeUInt16LE(32, 6);          // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

/**
 * Renders the SVG at one size.
 *
 * Through a real file rather than a data URL: a data URL this long failed to
 * load intermittently, and the failure came back as a bare ERR_FAILED with
 * nothing useful in it.
 */
async function render(win, size, scratch, box) {
  const svg = fs.readFileSync(SVG, 'utf8');
  const page = `<!doctype html><meta charset="utf-8">
    <style>
      html, body { margin: 0; width: ${box}px; height: ${box}px; background: transparent;
                   overflow: hidden; }
      svg { width: ${size}px; height: ${size}px; display: block; }
    </style>
    ${svg}`;

  const file = path.join(scratch, `icon-${size}.html`);
  fs.writeFileSync(file, page, 'utf8');

  await win.loadFile(file);
  // One frame, so the paint has actually happened before the capture.
  await new Promise((resolve) => setTimeout(resolve, 120));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  return image.toPNG();
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!fs.existsSync(SVG)) {
    console.error(`Missing ${SVG}`);
    app.exit(1);
    return;
  }

  const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cvcm-icon-'));

  // One window, kept at the largest size. Windows refuses to make a window as
  // small as 16 or 24 pixels, so the earlier approach of one window per size
  // failed on everything below about a hundred. Instead the SVG is drawn at
  // the size wanted in the corner of a big window and only that corner is
  // captured, which still renders each size properly rather than scaling one
  // bitmap down.
  const BOX = SIZES[SIZES.length - 1];
  const win = new BrowserWindow({
    width: BOX,
    height: BOX,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
  });

  const images = [];
  try {
    for (const size of SIZES) {
      const data = await render(win, size, scratch, BOX);
      images.push({ size, data });
      console.log(`  ${String(size).padStart(3)}px  ${(data.length / 1024).toFixed(1)} KB`);
    }
  } finally {
    win.destroy();
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  fs.writeFileSync(ICO, buildIco(images));
  fs.writeFileSync(PNG, images[images.length - 1].data);

  // A quick sanity check, since a malformed icon fails silently at pack time.
  const written = fs.readFileSync(ICO);
  const count = written.readUInt16LE(4);
  const ok = written.readUInt16LE(2) === 1 && count === SIZES.length;

  console.log(`\n${ICO}`);
  console.log(`  ${count} sizes, ${(written.length / 1024).toFixed(1)} KB  ${ok ? 'valid' : 'MALFORMED'}`);
  console.log(`${PNG}\n  ${SIZES[SIZES.length - 1]}px, for anything that wants a plain image`);

  app.exit(ok ? 0 : 1);
});

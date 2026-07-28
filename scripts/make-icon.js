'use strict';

/**
 * Turns assets/icon-source.png into assets/icon.ico and assets/icon.png.
 *
 *   npm run icon
 *
 * Windows wants one file holding several sizes, so the taskbar, the alt-tab
 * switcher and Explorer each get a bitmap meant for them rather than one
 * scaled badly at the last moment. This renders the artwork at each size and
 * packs them into a single .ico.
 *
 * The artwork is squared off first. Icons are square and the source need not
 * be, so it is centred on a square canvas rather than stretched, which would
 * distort it. The padding colour is sampled from the artwork's own corner, so
 * a solid background extends cleanly into the padding and a transparent one
 * stays transparent.
 *
 * Rendering happens in Electron because it is already a dependency and has a
 * real browser engine in it; adding an image library just for this would be
 * another package to carry.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'icon-source.png');
const ICO = path.join(ROOT, 'assets', 'icon.ico');
const PNG = path.join(ROOT, 'assets', 'icon.png');

// What Windows actually reaches for, smallest first.
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// How much of the tile the artwork fills. A little room stops it touching the
// edges, which is what makes an icon look placed rather than cropped.
const INSET = 0.92;

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

/** Renders the artwork onto a square tile of one size. */
async function render(win, size, scratch, box) {
  const page = `<!doctype html><meta charset="utf-8">
    <style>
      html, body { margin: 0; width: ${box}px; height: ${box}px; overflow: hidden;
                   background: transparent; }
      #tile { width: ${size}px; height: ${size}px; display: grid; place-items: center;
              overflow: hidden; }
      #tile img { max-width: ${INSET * 100}%; max-height: ${INSET * 100}%; }
    </style>
    <div id="tile"></div>
    <script>
      const art = new Image();
      art.src = 'icon-source.png';

      const loaded = art.complete
        ? Promise.resolve()
        : new Promise((r) => art.addEventListener('load', r, { once: true }));

      loaded.then(() => {
        const src = document.createElement('canvas');
        src.width = art.naturalWidth;
        src.height = art.naturalHeight;
        const sctx = src.getContext('2d', { willReadFrequently: true });
        sctx.drawImage(art, 0, 0);

        const px = sctx.getImageData(0, 0, src.width, src.height).data;
        const at = (x, y) => (y * src.width + x) * 4;
        const [br, bg, bb, ba] = [px[0], px[1], px[2], px[3]];
        const transparentBg = ba < 16;

        // Anything that is not the background colour counts as the artwork.
        // Without this the source's own margin is padded again, and the logo
        // ends up a small island in the middle of the tile.
        const isContent = (x, y) => {
          const i = at(x, y);
          if (px[i + 3] < 16) return false;
          if (transparentBg) return true;
          return Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb) > 24;
        };

        let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            if (!isContent(x, y)) continue;
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
        // An image that is entirely one colour has no content to find.
        if (x1 < x0 || y1 < y0) { x0 = 0; y0 = 0; x1 = src.width - 1; y1 = src.height - 1; }

        const cw = x1 - x0 + 1;
        const ch = y1 - y0 + 1;

        const out = document.createElement('canvas');
        out.width = ${size};
        out.height = ${size};
        const octx = out.getContext('2d');
        octx.imageSmoothingQuality = 'high';

        if (!transparentBg) {
          octx.fillStyle = 'rgb(' + br + ',' + bg + ',' + bb + ')';
          octx.fillRect(0, 0, ${size}, ${size});
        }

        const room = ${size} * ${INSET};
        const scale = Math.min(room / cw, room / ch);
        const dw = cw * scale;
        const dh = ch * scale;
        octx.drawImage(src, x0, y0, cw, ch, (${size} - dw) / 2, (${size} - dh) / 2, dw, dh);

        document.getElementById('tile').append(out);
        document.title = 'ready';
      });
    </script>`;

  const file = path.join(scratch, `icon-${size}.html`);
  fs.writeFileSync(file, page, 'utf8');

  await win.loadFile(file);
  // Wait for the corner sample to have been applied, not merely for load.
  for (let i = 0; i < 40; i++) {
    if (await win.webContents.executeJavaScript('document.title === "ready"')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 60));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  return image.toPNG();
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Missing ${SOURCE}`);
    app.exit(1);
    return;
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cvcm-icon-'));
  // The page loads the artwork by relative path, so it sits beside the pages.
  fs.copyFileSync(SOURCE, path.join(scratch, 'icon-source.png'));

  // One window, kept at the largest size. Windows refuses to make a window as
  // small as 16 or 24 pixels, so one window per size failed on everything
  // below about a hundred. Instead the artwork is drawn at the size wanted in
  // the corner of a big window and only that corner is captured, which still
  // renders each size properly rather than scaling one bitmap down.
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
  console.log(`${PNG}\n  ${BOX}px, for anything that wants a plain image`);

  app.exit(ok ? 0 : 1);
});

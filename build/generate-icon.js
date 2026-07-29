/**
 * Rasterizes build/icon.svg into build/icon.ico for electron-builder.
 *
 * Run with the project's own Electron binary, no extra dependencies and no
 * network:
 *
 *   npx electron build/generate-icon.js
 *
 * A hidden BrowserWindow draws the SVG onto a canvas at each size Windows
 * wants, and the PNG frames are packed into the .ico container here in the
 * main process (an .ico is just a 6-byte header, one 16-byte directory entry
 * per frame, then the PNG payloads).
 */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SVG_PATH = path.join(__dirname, 'icon.svg');
const ICO_PATH = path.join(__dirname, 'icon.ico');
const PREVIEW_PATH = path.join(__dirname, 'icon-256.png');

function packIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + 16 * frames.length;
  for (const { size, png } of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width, 0 means 256
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height, 0 means 256
    entry.writeUInt8(0, 2); // no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const svg = fs.readFileSync(SVG_PATH, 'utf8');
    const win = new BrowserWindow({ show: false, width: 320, height: 320 });
    await win.loadURL('about:blank');

    const dataUrls = await win.webContents.executeJavaScript(`
      (async () => {
        const svgUrl = 'data:image/svg+xml;charset=utf-8,' +
          encodeURIComponent(${JSON.stringify(svg)});
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('SVG failed to load'));
          img.src = svgUrl;
        });
        return ${JSON.stringify(SIZES)}.map((size) => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, size, size);
          return canvas.toDataURL('image/png');
        });
      })()
    `);

    const frames = SIZES.map((size, i) => ({
      size,
      png: Buffer.from(dataUrls[i].split(',')[1], 'base64'),
    }));

    fs.writeFileSync(ICO_PATH, packIco(frames));
    fs.writeFileSync(PREVIEW_PATH, frames[frames.length - 1].png);
    console.log(
      `Wrote ${ICO_PATH} (${SIZES.join(', ')}px) and ${PREVIEW_PATH}`
    );
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});

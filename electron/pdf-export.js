'use strict';

/**
 * Turning the on-screen report into paper or a PDF.
 *
 * Deliberately prints the WINDOW THAT IS ALREADY SHOWING the report rather than
 * rendering into a hidden second BrowserWindow. The renderer mounts the print
 * view into a portal and the print stylesheet hides everything else, so what
 * Chromium lays out here is the exact DOM whose numbers the teacher just read in
 * the dialog. A second render is a second chance for the paper to disagree with
 * the screen, and on a compliance document that is the one thing that must not
 * happen.
 *
 * The header and footer are ours, not Chromium's. Left alone, Chromium prints
 * the document title top-left and the page URL top-right - so a teacher's
 * compliance record went to the district with "http://localhost:5180/" across
 * the top of it. `displayHeaderFooter` with our own templates is the only way to
 * suppress that AND still get a page number, because Chromium does not support
 * CSS `@page` margin boxes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { dialog, shell } = require('electron');

const log = require('./app-log');

/** Inches. The bottom is deeper than the top to leave the footer its own band. */
const MARGINS = { top: 0.5, bottom: 0.62, left: 0.45, right: 0.45 };

/**
 * Empty, but not absent.
 *
 * `displayHeaderFooter: false` would take the page number with it, and omitting
 * `headerTemplate` makes Chromium fall back to its own title-and-URL default.
 * An empty element is what actually clears the top of the page.
 */
const HEADER_TEMPLATE = '<span></span>';

/**
 * Page number, bottom right, inset to match the body's own margin.
 *
 * Chromium renders footer templates in an isolated context at a default 8px with
 * no inherited styles, so every value here has to be stated inline. `padding` on
 * the wrapper is what keeps the number off the paper's edge.
 */
const FOOTER_TEMPLATE = `
  <div style="
    width: 100%;
    padding: 0 0.45in;
    box-sizing: border-box;
    font-family: Helvetica, Arial, sans-serif;
    font-size: 8px;
    color: #000;
    text-align: right;
  ">
    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
`;

function pdfOptions({ landscape = false } = {}) {
  return {
    pageSize: 'Letter',
    landscape,
    printBackground: true,
    // Our own options win over the stylesheet's `@page`, so the footer band is
    // guaranteed the room it needs regardless of what the CSS asks for.
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate: HEADER_TEMPLATE,
    footerTemplate: FOOTER_TEMPLATE,
    margins: { marginType: 'custom', ...MARGINS },
  };
}

/**
 * Render to PDF and offer to save it.
 *
 * @returns {Promise<{ok: boolean, path?: string, canceled?: boolean, reason?: string}>}
 */
async function exportPdf(win, { fileName = 'Accommodations.pdf', landscape = false } = {}) {
  if (!win || win.isDestroyed()) return { ok: false, reason: 'no-window' };

  let data;
  try {
    data = await win.webContents.printToPDF(pdfOptions({ landscape }));
  } catch (err) {
    log.error(`pdf export failed: ${err.message}`);
    return { ok: false, reason: 'render-failed' };
  }

  const result = await dialog.showSaveDialog(win, {
    title: 'Save accommodation report',
    defaultPath: fileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  try {
    fs.writeFileSync(result.filePath, data);
  } catch (err) {
    log.error(`pdf save failed: ${err.code || ''} ${err.message}`);
    return { ok: false, reason: err.code || 'write-failed' };
  }

  log.info(`exported report (${data.length} bytes)`);
  return { ok: true, path: result.filePath };
}

/** Open a just-saved PDF in the system reader. */
async function revealPdf(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: 'missing' };
  const err = await shell.openPath(filePath);
  return err ? { ok: false, reason: err } : { ok: true };
}

/**
 * Straight to the system print dialog.
 *
 * `header`/`footer` are set to a single space rather than left out: omitted,
 * Chromium reinstates its own title-and-URL pair, which is the whole thing we
 * are trying to get rid of.
 */
function printDirect(win, { landscape = false } = {}) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve({ ok: false, reason: 'no-window' });

    win.webContents.print(
      {
        silent: false,
        printBackground: true,
        landscape,
        pageSize: 'Letter',
        margins: { marginType: 'custom', ...MARGINS },
        header: ' ',
        footer: ' ',
      },
      (success, reason) => {
        if (!success && reason && reason !== 'cancelled') {
          log.error(`print failed: ${reason}`);
        }
        resolve({ ok: success, reason: success ? undefined : reason });
      }
    );
  });
}

/** `Accommodations_2026-09-01_to_2026-09-30.pdf` */
function suggestFileName(from, to) {
  const safe = (s) => String(s || '').replace(/[^\d-]/g, '');
  return `Accommodations_${safe(from)}_to_${safe(to)}.pdf`;
}

module.exports = { exportPdf, printDirect, revealPdf, suggestFileName, pdfOptions, MARGINS };

// Builds the desktop web bundle in dist/ from src/spot.html (the same source as the web version).
// - puts the Pro Tools session reader (src/ptx.js) into the page
// - swaps the Google Fonts link for fonts bundled in the app (works offline)
// - copies the PDF, Word, Excel and PDF-export libraries into dist/vendor
// - loads the desktop layer (src/desktop.js) before the app so the app saves to files
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const nm = p => join(root, 'node_modules', p);
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'vendor'), { recursive: true });
mkdirSync(join(dist, 'fonts'), { recursive: true });

// Libraries
const libs = {
  'jspdf/dist/jspdf.umd.min.js': 'jspdf.umd.min.js',
  'pdfjs-dist/build/pdf.min.js': 'pdf.min.js',
  'pdfjs-dist/build/pdf.worker.min.js': 'pdf.worker.min.js',
  'mammoth/mammoth.browser.min.js': 'mammoth.browser.min.js',
  'xlsx/dist/xlsx.full.min.js': 'xlsx.full.min.js',
};
for (const [from, to] of Object.entries(libs)) copyFileSync(nm(from), join(dist, 'vendor', to));

// Fonts (latin subsets, the weights the app uses)
const faces = [
  ['Libre Franklin', 'libre-franklin', [400, 500, 600, 700], ['normal', 'italic']],
  ['DM Mono', 'dm-mono', [400, 500], ['normal']],
];
let css = '', count = 0;
for (const [family, pkg, weights, styles] of faces) {
  for (const w of weights) for (const s of styles) {
    const file = `${pkg}-latin-${w}-${s}.woff2`;
    try { copyFileSync(nm(`@fontsource/${pkg}/files/${file}`), join(dist, 'fonts', file)); }
    catch { continue; }
    count++;
    css += `@font-face{font-family:"${family}";font-style:${s};font-weight:${w};font-display:swap;src:url(${file}) format("woff2")}\n`;
  }
}
if (!count) throw new Error('No fonts copied');
writeFileSync(join(dist, 'fonts/fonts.css'), css);

// Page
let page = readFileSync(join(root, 'src/spot.html'), 'utf8');
const ptx = readFileSync(join(root, 'src/ptx.js'), 'utf8');
const before = page;
page = page
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^"]*" rel="stylesheet">/, '<link rel="stylesheet" href="fonts/fonts.css">')
  .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/[^"]*" defer><\/script>/, '<script src="vendor/jspdf.umd.min.js"></script>\n<script src="desktop.js"></script>')
  .replace('/*PTX*/', () => ptx);
for (const must of ['fonts/fonts.css', 'vendor/jspdf.umd.min.js', 'desktop.js', 'function readPTX']) {
  if (!page.includes(must)) throw new Error('Page not prepared: ' + must);
}
if (page === before) throw new Error('Page unchanged');
writeFileSync(join(dist, 'index.html'), page);
copyFileSync(join(root, 'src/desktop.js'), join(dist, 'desktop.js'));
console.log('dist ready:', count, 'font faces,', Object.keys(libs).length, 'libraries');

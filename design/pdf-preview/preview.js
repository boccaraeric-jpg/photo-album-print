#!/usr/bin/env node
/**
 * Banc d'essai PDF : sort l'album sur PC tel que l'imprimera le téléphone.
 *
 *   node design/pdf-preview/preview.js [options]
 *
 *   --name <nom>        dossier de sortie sous design/pdf-preview/out/ (défaut : format-style-os)
 *   --format a4|16x21|16x16      (défaut 16x16 ; ignoré en pro, toujours A4)
 *   --style family|pro           (défaut family)
 *   --os ios|android             (défaut ios : la variante qui piège, cf. README)
 *   --lang fr|en                 langue de l'album (défaut fr)
 *   --img <dossier>     photos d'essai (ph*.jpg) et cartes (map*.jpg) ; sans lui, images factices
 *   --count <n>         nombre de photos factices (défaut 14)
 *   --opts '<json>'     ExportOptions à surcharger, ex. '{"frame":"border","photoSize":"large"}'
 *   --no-sheets         s'arrête au PDF (pas de planches PNG, donc pas besoin de Python)
 *
 * Ne voit que le moteur HTML (`src/pdf.ts`). Le moteur Skia (`src/pageImages.ts`,
 * « Images de l'album ») et les écrans de l'app ne se contrôlent que sur un appareil.
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Module = require('module');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;

// ---------------------------------------------------------------- arguments
const args = { format: '16x16', style: 'family', os: 'ios', lang: 'fr', count: '14', opts: '{}' };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--no-sheets') args.noSheets = true;
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
  else fail(`Argument inconnu : ${a}`);
}
function fail(msg) { console.error(msg); process.exit(1); }
if (!['ios', 'android'].includes(args.os)) fail('--os : ios ou android');
const overrides = (() => { try { return JSON.parse(args.opts); } catch (e) { return fail(`--opts : JSON invalide (${e.message})`); } })();
const name = args.name || `${args.style === 'pro' ? 'a4' : args.format}-${args.style}-${args.os}`;
const OUT = path.join(HERE, 'out', name);
fs.mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------- images d'essai
/** PNG uni + dégradé + hachures, sans dépendance : assez pour juger cadrage et recadrage. */
function fakePng(w, h, hue, grid) {
  const rgb = (hh, s, l) => {
    const f = (n) => { const k = (n + hh / 30) % 12; return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      let c;
      if (grid) {
        // Carte factice : fond clair quadrillé, « route » en diagonale.
        const line = x % 60 < 2 || y % 60 < 2;
        const road = Math.abs(x - y * (w / h)) < 5;
        c = road ? [240, 190, 90] : line ? [205, 215, 205] : [232, 238, 228];
      } else {
        const edge = x < 12 || y < 12 || x >= w - 12 || y >= h - 12; // liseré : un recadrage se voit
        const stripe = (x + y) % 90 < 6;
        c = edge ? rgb(hue, 0.6, 0.25) : rgb(hue, 0.45, (stripe ? 0.62 : 0.5) + 0.22 * (y / h - 0.5));
      }
      raw[row + 1 + x * 3] = c[0]; raw[row + 2 + x * 3] = c[1]; raw[row + 3 + x * 3] = c[2];
    }
  }
  const crcTable = fakePng.t || (fakePng.t = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const end = Buffer.alloc(4); end.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, end]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let imgDir = args.img && path.resolve(args.img);
if (!imgDir) {
  imgDir = path.join(HERE, 'out', '_factices');
  fs.mkdirSync(imgDir, { recursive: true });
  // Paysage, portrait, carré, panoramique : les cas que la mise en page distingue.
  const shapes = [[900, 675], [675, 900], [900, 900], [1200, 600], [900, 600], [600, 900]];
  const count = Math.max(1, parseInt(args.count, 10) || 14);
  for (const f of fs.readdirSync(imgDir)) fs.unlinkSync(path.join(imgDir, f));
  for (let i = 0; i < count; i++) {
    const [w, h] = shapes[i % shapes.length];
    fs.writeFileSync(path.join(imgDir, `ph${String(i).padStart(2, '0')}.png`), fakePng(w, h, (i * 47) % 360, false));
  }
  fs.writeFileSync(path.join(imgDir, 'map0.png'), fakePng(600, 400, 0, true));
}
const isImage = (f) => /\.(jpe?g|png)$/i.test(f);
const files = fs.readdirSync(imgDir).filter(isImage).sort();
const maps = files.filter((f) => /^map/i.test(f)).map((f) => path.join(imgDir, f));
const phs = files.filter((f) => !/^map/i.test(f)).map((f) => path.join(imgDir, f));
if (!phs.length) fail(`Aucune image dans ${imgDir}`);

function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { width: 0, height: 0 };
}

// ------------------------------------------- bouchons des modules natifs
require(path.join(ROOT, 'node_modules/sucrase/register/ts'));
const stub = new Proxy(function () {}, {
  get: (t, k) => (k === '__esModule' ? false : k === 'Platform' ? { OS: args.os } : k === 'documentDirectory' || k === 'cacheDirectory' ? 'file:///x/' : stub),
  apply: () => stub,
});
const readPrintImage = async (uri) => { const b = fs.readFileSync(uri); return { base64: b.toString('base64'), ...imageSize(b) }; };
const origLoad = Module._load;
Module._load = function (req, parent, ...rest) {
  if (/photoFiles$/.test(req)) return { readPrintImage, readPrintBase64: async (uri) => (await readPrintImage(uri)).base64 };
  if (/mapSnapshot$/.test(req)) {
    return { appleMapsAvailable: maps.length > 0, mapImagesFor: async (photos, ids) => new Map(photos.filter((p) => ids.has(p.id) && p._map).map((p) => [p.id, p._map])) };
  }
  if (/^(expo|react-native|@react-native)/.test(req)) return stub;
  return origLoad.call(this, req, parent, ...rest);
};

// ----------------------------------------------------------- album d'essai
// Lieux en minuscules, apostrophes manquantes, gras, texte long : les cas qui ont déjà cassé.
const places = [undefined, 'santana, portugal', undefined, undefined, 'porto moniz, portugal', undefined, 'Nîmes, France', 'sevrier, france', undefined, 'baume-les-messieurs, france', 'Athènes, Grèce', 'Athènes, Grèce', 'saint-cyr-sur-mer, France', "villeneuve-d'ascq, france"];
const comments = {
  4: 'Vue sur les piscines naturelles. Baignade au pied des falaises, eau à 22 degrés. **Journée magnifique.**',
  5: 'Magnifique',
  7: 'Le phare de ce port a protégé tant de marins ! Impressionnant d être au pied du mur.',
  9: 'Une superbe cascade du Jura qui montre que dans le Jura on ne manque pas d’eau. Vraiment.',
  10: 'L’acropole est magique la nuit. De notre terrasse, nous avions la chance de voir 30 siècles devant nous. __Qu il est beau__, ce rocher, quand la ville s éteint et que seules les colonnes restent éclairées.',
  13: 'Quel plaisir de découvrir ce port vraiment authentique, loin de la foule.',
};
const photos = phs.map((uri, i) => ({
  id: 'p' + i, albumId: 'a', uri, comment: comments[i] || '', createdAt: Date.UTC(2026, 8, 10 - i, 10),
  place: places[i % places.length], coords: places[i % places.length] ? { lat: 32 + i, lon: -17 + i } : undefined,
  _map: maps.length ? maps[i % maps.length] : undefined,
  pageBg: i < 2 ? '#e3d3b5' : undefined,
}));

const { buildAlbumHtml, DEFAULT_EXPORT_OPTIONS } = require(path.join(ROOT, 'src/pdf.ts'));
const options = {
  ...DEFAULT_EXPORT_OPTIONS,
  style: args.style, format: args.format,
  background: '#f6ddd0', frame: 'card', liseret: true, typeface: 'script', cover: 'scatter',
  photoMaps: true, dateFormat: 'long', photoSize: 'medium',
  ...overrides,
};

// ------------------------------------------------------------------ rendu
function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  return candidates.find((c) => c && fs.existsSync(c)) || fail('Chrome introuvable : donner son chemin dans la variable CHROME.');
}

buildAlbumHtml(photos, 'Album d’essai', options, 'p' + Math.min(9, photos.length - 1), args.lang).then((source) => {
  let html = source;
  if (args.os === 'ios') {
    // WebKit iOS compose la page sur floor(1,25 × taille du papier) px : Chrome ne le fait
    // pas tout seul, on lui impose cette page. Sans ça, le contrôle ne vaut rien pour l'iPhone.
    let n = 0;
    html = html.replace(/@page \{ size: ([\d.]+)pt ([\d.]+)pt;/g, (m, w, h) => { n++; return `@page { size: ${Math.floor(w * 1.25)}px ${Math.floor(h * 1.25)}px;`; });
    if (!n) fail('Règle @page introuvable : le gabarit a changé, adapter preview.js.');
  }
  const htmlPath = path.join(OUT, 'album.html');
  const pdfPath = path.join(OUT, 'album.pdf');
  fs.writeFileSync(htmlPath, html);
  const zoom = /html \{ zoom: ([\d.]+)/.exec(html);
  const page = /@page \{ size: ([^;]+);/.exec(html);
  console.log(`HTML   ${path.relative(ROOT, htmlPath)}  (page ${page ? page[1] : '?'}, zoom ${zoom ? zoom[1] : '1'})`);

  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  spawnSync(findChrome(), ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, 'file:///' + htmlPath.replace(/\\/g, '/')], { stdio: 'ignore' });
  if (!fs.existsSync(pdfPath)) fail('Chrome n’a pas produit le PDF.');
  console.log(`PDF    ${path.relative(ROOT, pdfPath)}`);

  if (args.noSheets) return;
  for (const f of fs.readdirSync(OUT)) if (/^planche-\d+\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const py = spawnSync(process.env.PYTHON || 'python', ['-I', '-X', 'utf8', path.join(HERE, 'sheets.py'), pdfPath, OUT], { encoding: 'utf8' });
  if (py.status !== 0) {
    console.error((py.stderr || py.error?.message || '').trim().split('\n').pop());
    fail('Planches non générées : il faut Python avec PyMuPDF (cf. README), ou passer --no-sheets.');
  }
  process.stdout.write(py.stdout);
}).catch((e) => { console.error(e); process.exit(1); });

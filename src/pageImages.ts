import {
  BlurStyle,
  ClipOp,
  ImageFormat,
  PaintStyle,
  Skia,
  TextAlign,
  type SkCanvas,
  type SkTypeface,
} from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import type { ExportOptions, Photo } from './types';
import { formatPhotoDate, photoDate } from './dateFormat';
import { dict, localeTag, type Lang } from './i18n';
import { pageBackground, paginateEntries, PER_PAGE, wideSlots } from './paginate';
import { albumFileBase } from './pdf';
import { MONTSERRAT_500, MONTSERRAT_800 } from './montserratFonts';
import { CAVEAT_400, CAVEAT_700, LORA_400, LORA_700 } from './albumFonts';
import { parseRich, type RichRun } from './richText';
import { readPrintBase64 } from './photoFiles';
import {
  buildMapModel,
  buildMiniMapModel,
  FULL_MAP,
  MAP_GAP,
  MAP_SHARE,
  mapPhotoIds,
  MINI_H,
  MINI_W,
  miniPinItems,
  photoCoords,
  photosOfMappedPlaces,
  type MapItem,
  type MapModel,
} from './albumMap';
import { mapImagesFor } from './mapSnapshot';
import {
  CAPTION_INK,
  COMMENT_BASE,
  COMMENT_SCALE,
  COVER_W,
  coverPicks,
  effectiveCover,
  gridLayout,
  GRID,
  META_INK,
  META_INK_DARK,
  META_SIZE,
  POLAROID,
  polaroidBox,
  scatterSlots,
  SCATTER_TITLE,
  seedOf,
  TYPE_SPECS,
  type FontFam,
} from './albumStyle';

/** Tronque un texte à `n` mots (légende de pleine page). */
function limitWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= n ? text.trim() : `${words.slice(0, n).join(' ')}…`;
}

/** Page A4 à ~150 dpi : bonne qualité d'impression pour un poids raisonnable. */
const W = 1240;
const H = 1754;
const PAD = 70;

interface PagePayload {
  base64: string;
  dest: string;
}

interface TextOpts {
  color: string;
  size: number;
  align?: TextAlign;
  maxLines?: number;
  bold?: boolean;
  letterSpacing?: number;
  /** Famille de police (Montserrat par défaut). */
  fam?: FontFam;
}

// Polices embarquées, mêmes fichiers que le PDF (cf. `FACES` de `pdf.ts`).
const FACE_DATA: Record<FontFam, [string, string]> = {
  sans: [MONTSERRAT_500, MONTSERRAT_800],
  serif: [LORA_400, LORA_700],
  script: [CAVEAT_400, CAVEAT_700],
};

// Typefaces mis en cache, créés à la première demande de chaque famille
// (l'API ParagraphBuilder rendait du vide sans fournisseur de polices ;
// l'API bas niveau drawText + Font est fiable).
const typefaces = new Map<FontFam, { regular?: SkTypeface; bold?: SkTypeface }>();

function makeFace(b64: string): SkTypeface | undefined {
  try {
    return Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBase64(b64)) ?? undefined;
  } catch {
    // Chargement impossible : Skia.Font(undefined) prendra la police par défaut.
    return undefined;
  }
}

function typefaceFor(bold: boolean, fam: FontFam = 'sans'): SkTypeface | undefined {
  let faces = typefaces.get(fam);
  if (!faces) {
    const [regular, heavy] = FACE_DATA[fam];
    faces = { regular: makeFace(regular), bold: makeFace(heavy) };
    typefaces.set(fam, faces);
  }
  const face = bold ? faces.bold ?? faces.regular : faces.regular;
  // Famille illisible : repli sur Montserrat plutôt que sur la police système.
  return face ?? (fam === 'sans' ? undefined : typefaceFor(bold, 'sans'));
}

/** Découpe un texte en lignes tenant dans `width`, avec ellipsis si tronqué. */
function wrapLines(
  font: ReturnType<typeof Skia.Font>,
  text: string,
  width: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length; i++) {
    const cand = line ? `${line} ${words[i]}` : words[i];
    if (!line || font.getTextWidth(cand) <= width) {
      line = cand;
    } else {
      lines.push(line);
      line = words[i];
      if (lines.length >= maxLines) {
        line = '';
        break;
      }
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Texte restant non placé → ellipsis sur la dernière ligne.
  const leftover = i < words.length - 1 || (line === '' && i < words.length);
  if (leftover && lines.length) {
    let last = lines[lines.length - 1];
    while (last && font.getTextWidth(`${last}…`) > width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Dessine un bloc de texte (avec retour à la ligne) et renvoie sa hauteur. */
function drawText(
  canvas: SkCanvas,
  text: string,
  x: number,
  y: number,
  width: number,
  o: TextOpts,
): number {
  if (!text) return 0;
  try {
    const font = fontFor(!!o.bold, o.size, o.fam);
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(o.color));

    const lineHeight = o.size * 1.32;
    const lines = wrapLines(font, text, width, o.maxLines ?? 999);
    lines.forEach((ln, idx) => {
      const w = font.getTextWidth(ln);
      let lx = x;
      if (o.align === TextAlign.Center) lx = x + (width - w) / 2;
      else if (o.align === TextAlign.Right) lx = x + (width - w);
      // Ligne de base ≈ y + taille de police pour le premier interligne.
      canvas.drawText(ln, lx, y + idx * lineHeight + o.size, paint, font);
    });
    return lines.length * lineHeight;
  } catch {
    return 0;
  }
}

/* --------------------------------------------------------------------------
 * Texte riche (**gras** / __souligné__) — pendant Skia de `richToHtml` du PDF.
 *
 * `drawText` ci-dessus ne connaît qu'une graisse par bloc : il reste pour les
 * textes nus (numéros, titres, dates). Les commentaires passent par
 * `drawRichText`, qui mesure mot à mot avec la police du fragment et souligne
 * au trait — Skia n'a pas de décoration de texte.
 * ------------------------------------------------------------------------ */

/** Fragment de mot : un morceau de texte d'un seul style, largeur mesurée. */
interface Seg {
  text: string;
  bold: boolean;
  underline: boolean;
  w: number;
}

/** Un mot = un ou plusieurs fragments collés (le style peut changer en son sein). */
type Word = Seg[];

// Les polices Skia sont coûteuses à créer : une par (famille, graisse, taille) suffit.
const fontCache = new Map<string, ReturnType<typeof Skia.Font>>();

function fontFor(bold: boolean, size: number, fam: FontFam = 'sans') {
  const key = `${fam}:${bold ? 'b' : 'r'}:${size}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  const font = Skia.Font(typefaceFor(bold, fam), size);
  fontCache.set(key, font);
  return font;
}

const segWidth = (seg: Seg) => seg.w;
const wordWidth = (word: Word) => word.reduce((sum, seg) => sum + segWidth(seg), 0);

/**
 * Découpe les fragments de style en mots mesurés (les blancs séparent).
 * `baseBold` : tout le texte en graisse forte (légende manuscrite).
 */
function toWords(runs: RichRun[], size: number, fam: FontFam, baseBold = false): Word[] {
  const words: Word[] = [];
  let current: Word = [];
  const flush = () => {
    if (current.length) words.push(current);
    current = [];
  };
  for (const run of runs) {
    // `split` avec capture : on conserve les blancs pour savoir où couper.
    for (const piece of run.text.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        flush();
        continue;
      }
      const bold = run.bold || baseBold;
      const font = fontFor(bold, size, fam);
      current.push({
        text: piece,
        bold,
        underline: run.underline,
        w: font.getTextWidth(piece),
      });
    }
  }
  flush();
  return words;
}

/** Répartit les mots en lignes tenant dans `width`, ellipsis si tronqué. */
function layoutRich(
  words: Word[],
  size: number,
  width: number,
  maxLines: number,
  fam: FontFam,
): Word[][] {
  const spaceW = fontFor(false, size, fam).getTextWidth(' ');
  const lines: Word[][] = [];
  let line: Word[] = [];
  let lineW = 0;
  let placed = 0;

  for (const word of words) {
    const w = wordWidth(word);
    const add = line.length ? spaceW + w : w;
    if (line.length && lineW + add > width) {
      lines.push(line);
      if (lines.length >= maxLines) {
        line = [];
        break;
      }
      line = [word];
      lineW = w;
    } else {
      line.push(word);
      lineW += add;
    }
    placed++;
  }
  if (line.length && lines.length < maxLines) lines.push(line);

  // Mots non placés → ellipsis collée au dernier fragment de la dernière ligne,
  // en rognant ce fragment tant que la ligne déborde.
  if (placed < words.length && lines.length) {
    const lastLine = lines[lines.length - 1];
    const lastWord = lastLine[lastLine.length - 1];
    const seg = lastWord?.[lastWord.length - 1];
    if (seg) {
      const font = fontFor(seg.bold, size, fam);
      const others =
        lastLine.reduce((sum, word) => sum + wordWidth(word), 0) -
        seg.w +
        spaceW * Math.max(0, lastLine.length - 1);
      let body = seg.text;
      seg.text = `${body}…`;
      seg.w = font.getTextWidth(seg.text);
      while (body && others + seg.w > width) {
        body = body.slice(0, -1);
        seg.text = `${body}…`;
        seg.w = font.getTextWidth(seg.text);
      }
    }
  }
  return lines;
}

const lineHeightFor = (size: number) => size * 1.32;

/** Hauteur qu'occupera `drawRichText` — sert à centrer/aligner en bas. */
function measureRich(
  text: string,
  width: number,
  o: Pick<TextOpts, 'size' | 'maxLines' | 'fam' | 'bold'>,
): number {
  if (!text) return 0;
  try {
    const fam = o.fam ?? 'sans';
    const words = toWords(parseRich(text), o.size, fam, !!o.bold);
    const lines = layoutRich(words, o.size, width, o.maxLines ?? 999, fam);
    return lines.length * lineHeightFor(o.size);
  } catch {
    return 0;
  }
}

/** Dessine un commentaire balisé et renvoie sa hauteur. */
function drawRichText(
  canvas: SkCanvas,
  text: string,
  x: number,
  y: number,
  width: number,
  o: TextOpts,
): number {
  if (!text) return 0;
  try {
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(o.color));
    const rule = Skia.Paint();
    rule.setAntiAlias(true);
    rule.setColor(Skia.Color(o.color));
    rule.setStyle(PaintStyle.Stroke);
    rule.setStrokeWidth(Math.max(1, o.size / 16));

    const fam = o.fam ?? 'sans';
    const words = toWords(parseRich(text), o.size, fam, !!o.bold);
    const lines = layoutRich(words, o.size, width, o.maxLines ?? 999, fam);
    const lineHeight = lineHeightFor(o.size);
    const spaceW = fontFor(false, o.size, fam).getTextWidth(' ');

    lines.forEach((line, idx) => {
      const textW =
        line.reduce((sum, word) => sum + wordWidth(word), 0) +
        spaceW * Math.max(0, line.length - 1);
      let cx = x;
      if (o.align === TextAlign.Center) cx = x + (width - textW) / 2;
      else if (o.align === TextAlign.Right) cx = x + (width - textW);
      // Ligne de base ≈ y + taille de police, comme `drawText`.
      const baseline = y + idx * lineHeight + o.size;
      for (const word of line) {
        for (const seg of word) {
          canvas.drawText(seg.text, cx, baseline, paint, fontFor(seg.bold, o.size, fam));
          if (seg.underline) {
            const uy = baseline + o.size * 0.16;
            canvas.drawLine(cx, uy, cx + seg.w, uy, rule);
          }
          cx += seg.w;
        }
        cx += spaceW;
      }
    });
    return lines.length * lineHeight;
  } catch {
    return 0;
  }
}

/** Dessine une image en mode « cover » (recadrée) dans un rectangle arrondi. */
function drawCoverImage(
  canvas: SkCanvas,
  encoded: ReturnType<typeof Skia.Image.MakeImageFromEncoded>,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  if (!encoded) return;
  const iw = encoded.width();
  const ih = encoded.height();
  const scale = Math.max(w / iw, h / ih);
  const cropW = w / scale;
  const cropH = h / scale;
  const src = Skia.XYWHRect((iw - cropW) / 2, (ih - cropH) / 2, cropW, cropH);
  const dest = Skia.XYWHRect(x, y, w, h);

  canvas.save();
  canvas.clipRRect(Skia.RRectXY(dest, radius, radius), ClipOp.Intersect, true);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(encoded, src, dest, paint);
  canvas.restore();
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Dessine une image « contain » (entière, centrée, sans recadrage) et renvoie
 * le rectangle réellement occupé par la photo (utile pour poser un liseré au
 * plus près de l'image, pas de la boîte).
 */
function drawContainImage(
  canvas: SkCanvas,
  encoded: ReturnType<typeof Skia.Image.MakeImageFromEncoded>,
  x: number,
  y: number,
  w: number,
  h: number,
): Rect | null {
  if (!encoded) return null;
  const iw = encoded.width();
  const ih = encoded.height();
  const scale = Math.min(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  canvas.drawImageRect(
    encoded,
    Skia.XYWHRect(0, 0, iw, ih),
    Skia.XYWHRect(dx, dy, dw, dh),
    paint,
  );
  return { x: dx, y: dy, w: dw, h: dh };
}

function rrect(x: number, y: number, w: number, h: number, r: number) {
  return Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r);
}

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128;
}

async function loadImage(uri: string) {
  try {
    const data = await Skia.Data.fromURI(uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } catch {
    return null;
  }
}

/** Photo réduite (côté long 900 px) pour les montages de couverture. */
async function loadThumb(uri: string) {
  try {
    const b64 = await readPrintBase64(uri, 900, 0.8);
    return Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(b64));
  } catch {
    return null;
  }
}

/**
 * Polaroïd incliné du pêle-mêle — pendant Skia de `.pola` (`pdf.ts`) : même
 * centre, même rotation autour du centre, mêmes marges de cadre.
 */
function drawPolaroid(
  canvas: SkCanvas,
  img: ReturnType<typeof Skia.Image.MakeImageFromEncoded>,
  slot: { cx: number; cy: number; size: number; rot: number },
  k: number,
  dark: boolean,
): void {
  const box = polaroidBox(slot.size);
  const w = box.w * k;
  const h = box.h * k;
  canvas.save();
  canvas.translate(slot.cx * k, slot.cy * k);
  canvas.rotate(slot.rot, 0, 0);

  // Ombre portée (≈ box-shadow 0 6px 16px du PDF).
  const shadow = Skia.Paint();
  shadow.setAntiAlias(true);
  shadow.setColor(Skia.Color(dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.26)'));
  shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 7 * k, true));
  canvas.drawRect(Skia.XYWHRect(-w / 2, -h / 2 + 6 * k, w, h), shadow);

  const frame = Skia.Paint();
  frame.setAntiAlias(true);
  frame.setColor(Skia.Color('#ffffff'));
  canvas.drawRRect(rrect(-w / 2, -h / 2, w, h, 2 * k), frame);

  const px = -w / 2 + POLAROID.pad * k;
  const py = -h / 2 + POLAROID.pad * k;
  const side = slot.size * k;
  if (img) {
    drawCoverImage(canvas, img, px, py, side, side, 0);
  } else {
    const empty = Skia.Paint();
    empty.setColor(Skia.Color('rgba(31,29,26,0.08)'));
    canvas.drawRect(Skia.XYWHRect(px, py, side, side), empty);
  }
  canvas.restore();
}

/** Grille (colonnes, lignes) pour un nombre de photos par page. */
function gridFor(perPage: number, count: number): { cols: number; rows: number } {
  if (perPage >= 4 && count > 1) return { cols: 2, rows: 2 };
  if (perPage >= 2 && count > 1) return { cols: 1, rows: 2 };
  return { cols: 1, rows: 1 };
}

async function renderPhotoPage(
  group: Photo[],
  options: ExportOptions,
  title: string,
  pageNo: number,
  perPage: number,
  pro: boolean,
  startNumber: number,
  lang: Lang,
  maps: MiniMaps = new Map(),
): Promise<PagePayload | null> {
  const D = dict(lang).doc;
  const surface = Skia.Surface.Make(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();

  const dark = isDark(options.background);
  const ink = dark ? '#f3efe7' : '#1f1d1a';
  const muted = dark ? '#8f8a80' : '#a89f8d';
  const whiteFrame = options.frame === 'card' || options.frame === 'polaroid';

  // Fond de page.
  const bg = Skia.Paint();
  bg.setColor(Skia.Color(options.background));
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);

  const { cols, rows } = gridFor(perPage, group.length);
  const gapX = 30;
  const gapY = 36;
  const footerH = 46;
  const contentW = W - 2 * PAD;
  const contentH = H - 2 * PAD - footerH;
  const cellW = (contentW - (cols - 1) * gapX) / cols;
  const cellH = (contentH - (rows - 1) * gapY) / rows;

  const images = await Promise.all(group.map((p) => loadImage(p.uri)));
  const mapImages = await Promise.all(group.map((p) => loadMiniMap(maps, p.id)));
  // Grille 2×2 : une photo avec carte prend une ligne entière (cf. `wideSlots`,
  // mêmes cases que le PDF).
  const slots =
    !pro && cols === 2 ? wideSlots(group, new Set(maps.keys())) : null;

  for (let i = 0; i < group.length; i++) {
    const photo = group[i];
    const slot = slots ? slots[i][0] : i;
    const c = slot % cols;
    const r = Math.floor(slot / cols);
    const cellX = PAD + c * (cellW + gapX);
    const cellY = PAD + r * (cellH + gapY);
    // Largeur de la case : deux colonnes pour une photo avec carte en grille.
    const cw = slots && slots[i][1] === 2 ? contentW : cellW;

    if (pro) {
      // Rendu professionnel : numéro, photo entière encadrée, légende factuelle
      // (lieu, date selon le réglage, description). L'encadrement suit le même
      // choix que le PDF pro (cf. `frameCss` dans `pdf.ts`).
      const numH = 34;
      drawText(canvas, D.photoNo(startNumber + i + 1), cellX, cellY, cellW, {
        color: '#111827',
        size: 24,
        bold: true,
        maxLines: 1,
      });
      const captionH = 150;
      const imgY = cellY + numH;
      const imgH = cellH - numH - captionH;

      const plate =
        options.frame === 'polaroid'
          ? '#ffffff'
          : options.frame === 'none'
            ? null
            : '#f8f9fa';
      const strokeColor =
        options.frame === 'border'
          ? '#d7dbe0'
          : options.frame === 'polaroid'
            ? '#e5e7eb'
            : null;
      // Le polaroïd garde une marge blanche épaisse autour de la vignette.
      const inset = options.frame === 'polaroid' ? 16 : 4;

      if (plate) {
        const back = Skia.Paint();
        back.setAntiAlias(true);
        back.setColor(Skia.Color(plate));
        canvas.drawRRect(rrect(cellX, imgY, cellW, imgH, 6), back);
      }
      drawContainImage(
        canvas,
        images[i],
        cellX + inset,
        imgY + inset,
        cellW - 2 * inset,
        imgH - 2 * inset,
      );
      if (strokeColor) {
        const border = Skia.Paint();
        border.setAntiAlias(true);
        border.setStyle(PaintStyle.Stroke);
        border.setStrokeWidth(2);
        border.setColor(Skia.Color(strokeColor));
        canvas.drawRRect(rrect(cellX + 1, imgY + 1, cellW - 2, imgH - 2, 6), border);
      }

      // « Aucune » retire la ligne de date entière.
      const date =
        options.dateFormat === 'none'
          ? ''
          : formatPhotoDate(photoDate(photo), options.dateFormat, lang) || '—';
      const dateAlign =
        options.dateAlign === 'center'
          ? TextAlign.Center
          : options.dateAlign === 'right'
            ? TextAlign.Right
            : TextAlign.Left;
      // Comme la date, la ligne « Lieu » disparaît quand l'option est décochée.
      const place = options.showPlace ? photo.place?.trim() || '—' : '';
      const desc = photo.comment.trim() || '—';
      let ty = imgY + imgH + 14;
      if (place) {
        ty +=
          drawText(canvas, `${D.place} : ${place}`, cellX, ty, cellW, {
            color: '#14181f',
            size: 20,
            maxLines: 1,
          }) + 4;
      }
      if (date) {
        ty +=
          drawText(canvas, `${D.date} : ${date}`, cellX, ty, cellW, {
            color: '#14181f',
            size: 20,
            maxLines: 1,
            align: dateAlign,
          }) + 4;
      }
      // Description : même texte riche que la légende familiale. Le gabarit pro
      // n'a pas de position verticale — sa fiche coule, comme dans le PDF.
      const descLabelW = fontFor(false, 20).getTextWidth(`${D.description} : `);
      drawText(canvas, `${D.description} : `, cellX, ty, cellW, {
        color: '#14181f',
        size: 20,
        maxLines: 1,
      });
      drawRichText(canvas, desc, cellX + descLabelW, ty, cellW - descLabelW, {
        color: '#14181f',
        size: 20,
        maxLines: 2,
      });
      continue;
    }

    // Cadre (familial).
    const pad = whiteFrame ? 20 : options.frame === 'border' ? 14 : 0;
    if (whiteFrame) {
      const card = Skia.Paint();
      card.setAntiAlias(true);
      card.setColor(Skia.Color('#ffffff'));
      canvas.drawRRect(rrect(cellX, cellY, cw, cellH, 10), card);
    } else if (options.frame === 'border') {
      const stroke = Skia.Paint();
      stroke.setAntiAlias(true);
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(3);
      stroke.setColor(Skia.Color(dark ? '#f3efe7' : '#1f1d1a'));
      canvas.drawRRect(rrect(cellX + 1.5, cellY + 1.5, cw - 3, cellH - 3, 12), stroke);
    }

    const comment = photo.comment.trim();
    const place = options.showPlace ? photo.place?.trim() : undefined;
    const date = formatPhotoDate(photoDate(photo), options.dateFormat, lang);
    const meta = [place, date].filter(Boolean).join(' · ');
    // La légende agrandie (manuscrite) prend sa place sur la photo, pas sur
    // l'espace entre les cartes : sinon la 2ᵉ ligne débordait sur le pied de page.
    const spec = TYPE_SPECS[options.typeface];
    const imgX = cellX + pad;
    const imgY = cellY + pad;
    const imgW = cw - 2 * pad;
    // Corps : même valeur que le PDF (points A4 × k). Le commentaire s'affiche
    // en entier (4 lignes au plus ; au-delà la photo a sa page, cf.
    // `isLongComment`) — la bande grandit et la photo cède la place.
    const k = W / COVER_W;
    const commentSize =
      (perPage === 4 ? COMMENT_BASE.small : COMMENT_BASE.other) *
      spec.captionScale *
      COMMENT_SCALE[options.commentSize] *
      k;
    const metaSize = META_SIZE * k;
    const commentOpts = {
      size: commentSize,
      maxLines: 4,
      fam: spec.caption,
      bold: spec.captionBold,
    };
    const textH =
      (comment ? measureRich(comment, imgW, commentOpts) : 0) +
      (comment && meta ? 6 : 0) +
      (meta ? lineHeightFor(metaSize) : 0);
    const minBand = Math.round((perPage === 4 ? 92 : 122) * spec.captionScale);
    const captionH = comment || meta ? Math.max(minBand, Math.ceil(textH) + 22) : 0;
    const imgH = cellH - 2 * pad - captionH;
    // Carte du lieu à droite de la photo (MAP_SHARE de la largeur, comme le PDF).
    const hasMap = maps.has(photo.id);
    const gap = MAP_GAP * (W / COVER_W);
    const mapW = hasMap ? (imgW - gap) * MAP_SHARE : 0;
    const photoW = hasMap ? imgW - gap - mapW : imgW;
    if (hasMap) {
      drawMiniMap(canvas, photo, mapImages[i], imgX + photoW + gap, imgY, mapW, imgH);
    }
    // « contain » : photo entière, non rognée (comme le PDF).
    const drawn = drawContainImage(canvas, images[i], imgX, imgY, photoW, imgH);

    // Liseré BLANC autour de la photo (+ fin contour extérieur pour la définition).
    if (options.liseret && drawn) {
      const white = Skia.Paint();
      white.setAntiAlias(true);
      white.setStyle(PaintStyle.Stroke);
      white.setStrokeWidth(12);
      white.setColor(Skia.Color('#ffffff'));
      canvas.drawRRect(rrect(drawn.x, drawn.y, drawn.w, drawn.h, 3), white);
      const edge = Skia.Paint();
      edge.setAntiAlias(true);
      edge.setStyle(PaintStyle.Stroke);
      edge.setStrokeWidth(1.5);
      edge.setColor(Skia.Color(dark ? '#5a5348' : '#b9ac93'));
      canvas.drawRRect(
        rrect(drawn.x - 6, drawn.y - 6, drawn.w + 12, drawn.h + 12, 4),
        edge,
      );
    }

    // Légende (commentaire tronqué + date · lieu) sous la photo.
    const captionColor = whiteFrame || !dark ? CAPTION_INK : ink;
    // Date/lieu nettement lisibles (le tan clair passait inaperçu sur fond crème).
    const metaColor = !whiteFrame && dark ? META_INK_DARK : META_INK;
    const align =
      options.frame === 'polaroid' ? TextAlign.Center : TextAlign.Left;
    // Alignement de la date/lieu selon l'option (Gauche/Centre/Droite).
    const dateAlign =
      options.dateAlign === 'center'
        ? TextAlign.Center
        : options.dateAlign === 'right'
          ? TextAlign.Right
          : TextAlign.Left;
    // Position verticale du commentaire dans la bande qui lui est réservée
    // (pendant Skia de la bande `.caption` du PDF). On mesure le bloc avant de
    // le dessiner pour répartir le vide au-dessus, autour ou en dessous.
    const bandTop = imgY + imgH + 14;
    const bandH = Math.max(0, captionH - 14);
    const blockH = textH;
    const slack = Math.max(0, bandH - blockH);
    const vAlign = options.commentVAlign ?? 'top';
    let ty =
      bandTop +
      (vAlign === 'middle' ? slack / 2 : vAlign === 'bottom' ? slack : 0);

    if (comment) {
      ty += drawRichText(canvas, comment, imgX, ty, imgW, {
        ...commentOpts,
        color: captionColor,
        align,
      });
      ty += 6;
    }
    if (meta) {
      drawText(canvas, meta.toLowerCase(), imgX, ty, imgW, {
        color: metaColor,
        size: metaSize,
        maxLines: 1,
        align: dateAlign,
        letterSpacing: 1,
        fam: spec.meta,
      });
    }
  }

  // Pied de page : numéro seul (le titre ne figure que sur la couverture).
  drawText(canvas, String(pageNo), PAD, H - PAD - 24, contentW, {
    color: muted,
    size: 18,
    align: TextAlign.Center,
    maxLines: 1,
  });

  return encodeSurface(surface, title, pageNo);
}

async function renderCover(
  photos: Photo[],
  options: ExportOptions,
  title: string,
  pro: boolean,
  lang: Lang,
  coverPhotoId?: string,
  scatterIds?: string[],
): Promise<PagePayload | null> {
  const surface = Skia.Surface.Make(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();

  const count = photos.length ? dict(lang).album.photoCount(photos.length) : '';

  if (pro) {
    // Couverture sobre de rapport : fond blanc, titre et méta factuelles.
    const bg = Skia.Paint();
    bg.setColor(Skia.Color('#ffffff'));
    canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);
    const today = new Date().toLocaleDateString(localeTag(lang), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    let ty = 260;
    ty +=
      drawText(canvas, title, PAD, ty, W - 2 * PAD, {
        color: '#111827',
        size: 64,
        bold: true,
        maxLines: 3,
      }) + 30;
    const rule = Skia.Paint();
    rule.setColor(Skia.Color('#111827'));
    canvas.drawRect(Skia.XYWHRect(PAD, ty, 130, 4), rule);
    ty += 44;
    ty +=
      drawText(canvas, `${dict(lang).doc.establishedOn} ${today}`, PAD, ty, W - 2 * PAD, {
        color: '#14181f',
        size: 26,
        maxLines: 1,
      }) + 8;
    drawText(canvas, `${count}`, PAD, ty, W - 2 * PAD, {
      color: '#6b7280',
      size: 24,
      maxLines: 1,
    });
    return encodeSurface(surface, title, 0);
  }

  const dark = isDark(options.background);
  const ink = dark ? '#f3efe7' : '#1f1d1a';
  const muted = dark ? '#8f8a80' : '#a89f8d';
  const accent = dark ? '#e3a455' : '#b45309';

  const bg = Skia.Paint();
  bg.setColor(Skia.Color(options.background));
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);

  const spec = TYPE_SPECS[options.typeface];
  // Année (ou plage d'années) en gras sous le titre, comme dans l'aperçu.
  const years = photos.map((p) => new Date(photoDate(p)).getFullYear());
  const yearLabel = years.length
    ? Math.min(...years) === Math.max(...years)
      ? `${Math.min(...years)}`
      : `${Math.min(...years)} – ${Math.max(...years)}`
    : '';

  const style = effectiveCover(options.cover, photos.length);
  if (style !== 'classic') {
    const k = W / COVER_W; // points A4 → pixels de l'image
    const picks = coverPicks(photos, style, coverPhotoId, scatterIds);
    // Vignettes réduites : jusqu'à 9 photos décodées en pleine résolution
    // (~48 Mo chacune) feraient tuer l'app par iOS.
    const thumbs = await Promise.all(picks.map((p) => loadThumb(p.uri)));
    const head = (top: number, size: number) => {
      const ty =
        top * k +
        drawText(canvas, title, SCATTER_TITLE.side * k, top * k, (COVER_W - 2 * SCATTER_TITLE.side) * k, {
          color: ink,
          size: size * spec.titleScale * k,
          align: TextAlign.Center,
          bold: true,
          maxLines: 2,
          fam: spec.title,
        });
      if (yearLabel) {
        drawText(canvas, yearLabel, PAD, ty + 8 * k, W - 2 * PAD, {
          color: accent,
          size: 24 * spec.titleScale * k,
          align: TextAlign.Center,
          bold: true,
          maxLines: 1,
          fam: spec.title,
        });
      }
    };

    if (style === 'scatter') {
      head(SCATTER_TITLE.top, SCATTER_TITLE.size);
      const slots = scatterSlots(picks.length, seedOf(picks.map((p) => p.id)));
      // Ordre d'empilement : la photo étoilée en dernier, donc au-dessus.
      const order = slots.map((_, i) => i).sort((a, b) => slots[a].z - slots[b].z);
      for (const i of order) {
        drawPolaroid(canvas, thumbs[i], slots[i], k, dark);
      }
    } else {
      const layout = gridLayout(picks.length);
      picks.forEach((_, i) => {
        const c = layout.cells[i];
        const x = c.x * k;
        const y = c.y * k;
        const w = c.w * k;
        const h = c.h * k;
        const empty = Skia.Paint();
        empty.setColor(Skia.Color('rgba(31,29,26,0.08)'));
        canvas.drawRect(Skia.XYWHRect(x, y, w, h), empty);
        drawCoverImage(canvas, thumbs[i], x, y, w, h, 0);
      });
      head(layout.titleY, GRID.titleSize);
    }
    return encodeSurface(surface, title, 0);
  }

  const cover = photos.find((p) => p.id === coverPhotoId) ?? photos[0];
  if (cover) {
    const img = await loadImage(cover.uri);
    drawCoverImage(canvas, img, PAD, PAD, W - 2 * PAD, 1040, 40);
  }

  let ty = PAD + 1040 + 60;
  ty += drawText(canvas, dict(lang).home.kicker, PAD, ty, W - 2 * PAD, {
    color: accent,
    size: 22,
    align: TextAlign.Center,
    bold: true,
    letterSpacing: 6,
    maxLines: 1,
  });
  ty += 18;
  ty += drawText(canvas, title, PAD, ty, W - 2 * PAD, {
    color: ink,
    size: 76 * spec.titleScale,
    align: TextAlign.Center,
    bold: true,
    maxLines: 2,
    fam: spec.title,
  });
  if (yearLabel) {
    ty += 16;
    drawText(canvas, yearLabel, PAD, ty, W - 2 * PAD, {
      color: accent,
      size: 52 * spec.titleScale,
      align: TextAlign.Center,
      bold: true,
      letterSpacing: 4,
      maxLines: 1,
      fam: spec.title,
    });
  }
  // Familial : pas de nombre total de photos affiché sur la couverture.

  return encodeSurface(surface, title, 0);
}

/** Page de texte seule (Skia) : texte centré sur le fond de l'album. */
function renderTextPage(
  item: Photo,
  options: ExportOptions,
  title: string,
  pageNo: number,
): PagePayload | null {
  const surface = Skia.Surface.Make(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const dark = isDark(options.background);
  const ink = dark ? '#f3efe7' : '#1f1d1a';
  const muted = dark ? '#8f8a80' : '#a89f8d';

  const bg = Skia.Paint();
  bg.setColor(Skia.Color(options.background));
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);

  // Centrage vertical du bloc de texte dans la page : on mesure d'abord sa
  // hauteur (mêmes règles que drawText), puis on choisit le y de départ.
  const bodyText = item.comment.trim();
  const bodySize = 46;
  // Pro : Montserrat imposée (cf. `buildAlbumImages`, typeface forcée à `sans`).
  const bodyFam = TYPE_SPECS[options.typeface].text;
  const bodyFont = fontFor(false, bodySize, bodyFam);
  const bodyLines = wrapLines(bodyFont, bodyText, W - 2 * PAD, 12);
  const blockH = bodyLines.length * bodySize * 1.32;
  // Pro : texte en HAUT à gauche (présentation « document ») ; familial : centré
  // verticalement.
  const isPro = options.style === 'pro';
  const startY = isPro ? PAD + 20 : Math.max(PAD + 40, (H - blockH) / 2);
  const bodyAlign =
    options.textAlign === 'left'
      ? TextAlign.Left
      : options.textAlign === 'right'
        ? TextAlign.Right
        : TextAlign.Center;
  drawText(canvas, bodyText, PAD, startY, W - 2 * PAD, {
    color: ink,
    size: bodySize,
    align: bodyAlign,
    maxLines: 12,
    fam: bodyFam,
  });
  drawText(canvas, String(pageNo), PAD, H - PAD - 24, W - 2 * PAD, {
    color: muted,
    size: 18,
    align: TextAlign.Center,
    maxLines: 1,
  });
  return encodeSurface(surface, title, pageNo);
}

/** Photo pleine page (bord à bord) + légende courte en pied (Skia). */
async function renderFullPage(
  item: Photo,
  options: ExportOptions,
  title: string,
  pageNo: number,
  maps: MiniMaps = new Map(),
): Promise<PagePayload | null> {
  const surface = Skia.Surface.Make(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const dark = isDark(options.background);
  const ink = dark ? '#f3efe7' : '#1f1d1a';

  const bg = Skia.Paint();
  bg.setColor(Skia.Color(options.background));
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);

  const capH = 150;
  const img = await loadImage(item.uri);
  drawCoverImage(canvas, img, 0, 0, W, H - capH, 0);

  // Carte en médaillon dans le coin bas-droit de la photo (cf. `.full-map`).
  if (maps.has(item.id)) {
    const k = W / COVER_W;
    const mw = FULL_MAP.w * k;
    const mh = FULL_MAP.h * k;
    const mx = W - FULL_MAP.margin * k - mw;
    const my = H - capH - FULL_MAP.margin * k - mh;
    const b = FULL_MAP.border * k;
    const shadow = Skia.Paint();
    shadow.setAntiAlias(true);
    shadow.setColor(Skia.Color('rgba(0,0,0,0.3)'));
    shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 7 * k, true));
    canvas.drawRect(Skia.XYWHRect(mx - b, my - b + 4 * k, mw + 2 * b, mh + 2 * b), shadow);
    const frame = Skia.Paint();
    frame.setColor(Skia.Color('#ffffff'));
    canvas.drawRect(Skia.XYWHRect(mx - b, my - b, mw + 2 * b, mh + 2 * b), frame);
    drawMiniMap(canvas, item, await loadMiniMap(maps, item.id), mx, my, mw, mh);
  }

  const comment = limitWords(item.comment, 15);
  if (comment) {
    const spec = TYPE_SPECS[options.typeface];
    // Première ligne centrée dans le bandeau quel que soit le corps (en
    // Montserrat : H - 96, la position d'origine).
    const size = 14 * spec.captionScale * COMMENT_SCALE[options.commentSize] * (W / COVER_W);
    const opts = { size, maxLines: 2, fam: spec.caption, bold: spec.captionBold };
    // Bloc centré verticalement dans le bandeau, quelle que soit sa hauteur.
    const top = H - capH / 2 - measureRich(comment, W - 2 * PAD, opts) / 2;
    drawRichText(canvas, comment, PAD, top, W - 2 * PAD, {
      ...opts,
      color: dark ? ink : CAPTION_INK,
      align: TextAlign.Center,
    });
  }
  return encodeSurface(surface, title, pageNo);
}

/**
 * Dessine les éléments d'un modèle de carte (`albumMap.ts`) dans le repère
 * courant du canevas — pendant Skia de `mapSvgParts` (`pdf.ts`).
 */
function drawMapItems(canvas: SkCanvas, items: MapItem[]): void {
  for (const it of items) {
    try {
      if (it.kind === 'shape') {
        const path = Skia.Path.MakeFromSVGString(it.d);
        if (!path) continue;
        canvas.save();
        if (it.clip) {
          canvas.clipRect(Skia.XYWHRect(it.clip.x, it.clip.y, it.clip.w, it.clip.h), ClipOp.Intersect, true);
        }
        if (it.offset) canvas.translate(it.offset[0], it.offset[1]);
        if (it.fill) {
          const paint = Skia.Paint();
          paint.setAntiAlias(true);
          paint.setColor(Skia.Color(it.fill));
          if (it.opacity !== undefined) paint.setAlphaf(it.opacity);
          canvas.drawPath(path, paint);
        }
        if (it.stroke) {
          const paint = Skia.Paint();
          paint.setAntiAlias(true);
          paint.setStyle(PaintStyle.Stroke);
          paint.setStrokeWidth(it.width ?? 1);
          paint.setColor(Skia.Color(it.stroke));
          if (it.opacity !== undefined) paint.setAlphaf(it.opacity);
          if (it.dash) {
            const effect = Skia.PathEffect.MakeDash(it.dash, 0);
            if (effect) paint.setPathEffect(effect);
          }
          canvas.drawPath(path, paint);
        }
        canvas.restore();
        continue;
      }
      // Texte : interlettrage à la main (Skia n'en a pas), ancrage mesuré.
      const font = fontFor(it.bold, it.size, it.fam);
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      paint.setColor(Skia.Color(it.color));
      const spacing = it.spacing ?? 0;
      const chars = spacing ? [...it.text] : [it.text];
      const widths = chars.map((c) => font.getTextWidth(c));
      const total = widths.reduce((a, b) => a + b, 0) + spacing * chars.length;
      let x = it.anchor === 'middle' ? it.x - total / 2 : it.anchor === 'end' ? it.x - total : it.x;
      chars.forEach((c, i) => {
        canvas.drawText(c, x, it.y, paint, font);
        x += widths[i] + spacing;
      });
    } catch {
      // Un élément illisible ne doit pas priver l'album du reste de la page.
    }
  }
}

/**
 * Cartes des photos : id → fichier de l'image Apple Plans, `null` = carte hors
 * ligne. Décodées page par page seulement (~4 Mo chacune une fois décodée).
 */
type MiniMaps = Map<string, string | null>;

async function loadMiniMap(maps: MiniMaps, id: string) {
  const uri = maps.get(id);
  return uri ? loadImage(uri) : null;
}

/**
 * Carte d'une photo dans un rectangle (pixels) : image Apple Plans ou carte
 * stylisée hors ligne, cadrées « cover », puis le repère au centre.
 */
function drawMiniMap(
  canvas: SkCanvas,
  photo: Photo,
  image: ReturnType<typeof Skia.Image.MakeImageFromEncoded> | null,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const c = photoCoords(photo);
  if (!c) return;
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(x, y, w, h), ClipOp.Intersect, true);
  if (image) {
    drawCoverImage(canvas, image, x, y, w, h, 0);
  } else {
    const s = Math.max(w / MINI_W, h / MINI_H);
    canvas.translate(x + (w - MINI_W * s) / 2, y + (h - MINI_H * s) / 2);
    canvas.scale(s, s);
    drawMapItems(canvas, buildMiniMapModel(c.lat, c.lon).items);
  }
  canvas.restore();
  drawMapItems(canvas, miniPinItems(x + w / 2, y + h / 2, W / COVER_W));
}

/**
 * Page carte (Skia) : dessine le modèle de `albumMap.ts` tel quel, en points
 * A4 mis à l'échelle — même liste de tracés et de textes que le SVG du PDF.
 */
function renderMapPage(
  model: MapModel,
  options: ExportOptions,
  title: string,
): PagePayload | null {
  const surface = Skia.Surface.Make(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  const bg = Skia.Paint();
  bg.setColor(Skia.Color(options.background));
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);

  canvas.save();
  const k = W / COVER_W;
  canvas.scale(k, k);
  drawMapItems(canvas, model.items);
  canvas.restore();
  return encodeSurface(surface, title, 0, '00b-carte');
}

function encodeSurface(
  surface: ReturnType<typeof Skia.Surface.Make>,
  title: string,
  pageNo: number,
  name?: string,
): PagePayload | null {
  if (!surface) return null;
  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, 92);
  const suffix = name ?? (pageNo === 0 ? '00-couverture' : String(pageNo).padStart(2, '0'));
  const dest = `${FileSystem.cacheDirectory}${albumFileBase(title)} - p${suffix}.jpg`;
  return { base64, dest };
}

/**
 * Rend le mini album en une suite d'images JPEG (couverture + une image par
 * page), écrites dans le cache. Rendu Skia déterministe (aucune dépendance à
 * une capture de WebView), pensé pour un usage hors-ligne et haute résolution.
 *
 * @returns la liste des URI des images générées, dans l'ordre.
 */
export async function buildAlbumImages(
  photos: Photo[],
  title: string,
  options: ExportOptions,
  coverPhotoId?: string,
  lang: Lang = 'fr',
  scatterIds?: string[],
): Promise<string[]> {
  const uris: string[] = [];

  const push = async (payload: PagePayload | null) => {
    if (!payload) return;
    await FileSystem.writeAsStringAsync(payload.dest, payload.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    uris.push(payload.dest);
  };

  const pro = options.style === 'pro';
  // En mode pro : gabarit imposé (fond blanc, 2 photos/page). L'encadrement, le
  // format et la position de la date restent réglables par l'utilisateur.
  // Typographie et couverture restent celles du gabarit pro (Montserrat, page
  // de garde factuelle), comme dans `buildProDocument`.
  const eff: ExportOptions = pro
    ? { ...options, background: '#ffffff', typeface: 'sans', cover: 'classic' }
    : options;

  const photoEntries = photos.filter((p) => p.kind !== 'text');
  await push(
    await renderCover(photoEntries, eff, title, pro, lang, coverPhotoId, scatterIds),
  );

  // Cartes à côté des photos (familial) : images Apple Plans gardées sur le
  // téléphone, sinon carte stylisée hors ligne (`null`).
  const mapIds = !pro && eff.photoMaps ? mapPhotoIds(photos) : new Set<string>();
  const maps: MiniMaps = new Map();
  if (mapIds.size) {
    for (const [id, uri] of await mapImagesFor(photos, mapIds)) maps.set(id, uri);
  }

  // Carte des lieux juste après la couverture (familial ; rien sans GPS).
  if (!pro && eff.showMap) {
    const model = buildMapModel(
      mapIds.size ? photosOfMappedPlaces(photos, mapIds) : photos,
      eff.typeface,
      eff.background,
      lang,
    );
    if (model) await push(renderMapPage(model, eff, title));
  }

  // Couverture classique : la photo de couverture ne réapparaît dans les pages
  // que si elle porte un commentaire. Les montages gardent toutes leurs photos
  // dans les pages (même règle que `buildAlbumHtml`).
  const coverPhoto =
    photoEntries.find((p) => p.id === coverPhotoId) ?? photoEntries[0];
  const classicCover = effectiveCover(eff.cover, photoEntries.length) === 'classic';
  const pageSource =
    !pro && classicCover && coverPhoto && coverPhoto.comment.trim().length === 0
      ? photos.filter((p) => p.id !== coverPhoto.id)
      : photos;

  // Les pages de texte s'intercalent dans les deux rendus (familial et pro).
  // Pro : 2 photos par page, sans taille ni fond par photo. Familial : taille
  // et fond propres à une photo (aperçu interactif) honorés page par page.
  const pages = paginateEntries(pageSource, pro ? 'medium' : eff.photoSize, {
    wide: mapIds,
    commentScale: pro ? 1 : COMMENT_SCALE[eff.commentSize],
    perPhotoSize: !pro,
  });
  let numbered = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const entries = page.type === 'text' ? [page.item] : page.items;
    const bg = pro ? undefined : pageBackground(entries);
    // Fond propre : toutes les couleurs de la page en découlent (cf. `isDark`).
    const pageOpts = bg ? { ...eff, background: bg } : eff;
    if (page.type === 'text') {
      await push(renderTextPage(page.item, pageOpts, title, i + 1));
      continue;
    }
    if (page.size === 'full') {
      await push(await renderFullPage(page.items[0], pageOpts, title, i + 1, maps));
      continue;
    }
    await push(
      await renderPhotoPage(
        page.items,
        pageOpts,
        title,
        i + 1,
        PER_PAGE[page.size],
        pro,
        numbered,
        lang,
        maps,
      ),
    );
    numbered += page.items.length;
  }

  return uris;
}

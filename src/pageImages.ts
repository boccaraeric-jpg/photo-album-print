import {
  ClipOp,
  FontWeight,
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
import { paginatePhotos, PER_PAGE } from './paginate';
import { albumFileBase } from './pdf';

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
}

// Typefaces système mis en cache (l'API ParagraphBuilder rendait du vide sans
// fournisseur de polices ; l'API bas niveau drawText + Font est fiable).
let tfRegular: SkTypeface | undefined;
let tfBold: SkTypeface | undefined;
let tfResolved = false;

function typefaceFor(bold: boolean): SkTypeface | undefined {
  if (!tfResolved) {
    tfResolved = true;
    try {
      const fm = Skia.FontMgr.System();
      tfRegular = fm.matchFamilyStyle('Helvetica', { weight: FontWeight.Normal });
      tfBold = fm.matchFamilyStyle('Helvetica', { weight: FontWeight.Bold });
    } catch {
      // Polices système indisponibles : Skia.Font(undefined) prendra la défaut.
    }
  }
  return bold ? tfBold ?? tfRegular : tfRegular;
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
    const font = Skia.Font(typefaceFor(!!o.bold), o.size);
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
): Promise<PagePayload | null> {
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

  for (let i = 0; i < group.length; i++) {
    const photo = group[i];
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cellX = PAD + c * (cellW + gapX);
    const cellY = PAD + r * (cellH + gapY);

    if (pro) {
      // Rendu professionnel : numéro, photo entière encadrée d'un filet,
      // légende factuelle (date/heure, lieu, description).
      const numH = 34;
      drawText(canvas, `Photo n° ${startNumber + i + 1}`, cellX, cellY, cellW, {
        color: '#111827',
        size: 24,
        bold: true,
        maxLines: 1,
      });
      const captionH = 150;
      const imgY = cellY + numH;
      const imgH = cellH - numH - captionH;
      const back = Skia.Paint();
      back.setAntiAlias(true);
      back.setColor(Skia.Color('#f8f9fa'));
      canvas.drawRRect(rrect(cellX, imgY, cellW, imgH, 6), back);
      drawContainImage(canvas, images[i], cellX + 4, imgY + 4, cellW - 8, imgH - 8);
      const border = Skia.Paint();
      border.setAntiAlias(true);
      border.setStyle(PaintStyle.Stroke);
      border.setStrokeWidth(2);
      border.setColor(Skia.Color('#d7dbe0'));
      canvas.drawRRect(rrect(cellX + 1, imgY + 1, cellW - 2, imgH - 2, 6), border);

      const date = formatPhotoDate(photoDate(photo), 'full') || '—';
      const place = photo.place?.trim() || '—';
      const desc = photo.comment.trim() || '—';
      let ty = imgY + imgH + 14;
      ty +=
        drawText(canvas, `Lieu : ${place}`, cellX, ty, cellW, {
          color: '#14181f',
          size: 20,
          maxLines: 1,
        }) + 4;
      ty +=
        drawText(canvas, `Date : ${date}`, cellX, ty, cellW, {
          color: '#14181f',
          size: 20,
          maxLines: 1,
        }) + 4;
      drawText(canvas, `Description : ${desc}`, cellX, ty, cellW, {
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
      canvas.drawRRect(rrect(cellX, cellY, cellW, cellH, 10), card);
    } else if (options.frame === 'border') {
      const stroke = Skia.Paint();
      stroke.setAntiAlias(true);
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(3);
      stroke.setColor(Skia.Color(dark ? '#f3efe7' : '#1f1d1a'));
      canvas.drawRRect(rrect(cellX + 1.5, cellY + 1.5, cellW - 3, cellH - 3, 12), stroke);
    }

    const comment = photo.comment.trim();
    const place = photo.place?.trim();
    const date = formatPhotoDate(photoDate(photo), options.dateFormat);
    const meta = [place, date].filter(Boolean).join(' · ');
    const captionH = comment || meta ? (perPage === 4 ? 70 : 96) : 0;

    const imgX = cellX + pad;
    const imgY = cellY + pad;
    const imgW = cellW - 2 * pad;
    const imgH = cellH - 2 * pad - captionH;
    // « contain » : photo entière, non rognée (comme le PDF).
    const drawn = drawContainImage(canvas, images[i], imgX, imgY, imgW, imgH);

    // Liseré (option additive) : fin trait posé sur la photo elle-même.
    if (options.liseret && drawn) {
      const line = Skia.Paint();
      line.setAntiAlias(true);
      line.setStyle(PaintStyle.Stroke);
      line.setStrokeWidth(2);
      line.setColor(Skia.Color(dark ? '#f3efe7' : '#14181f'));
      canvas.drawRRect(rrect(drawn.x, drawn.y, drawn.w, drawn.h, 3), line);
    }

    // Légende (commentaire tronqué + date · lieu) sous la photo.
    let ty = imgY + imgH + 14;
    const captionColor = whiteFrame ? '#2c2a26' : ink;
    const metaColor = whiteFrame ? '#a89f8d' : muted;
    const align =
      options.frame === 'polaroid' ? TextAlign.Center : TextAlign.Left;
    if (comment) {
      ty += drawText(canvas, comment, imgX, ty, imgW, {
        color: captionColor,
        size: perPage === 4 ? 20 : 24,
        maxLines: 2,
        align,
      });
      ty += 6;
    }
    if (meta) {
      drawText(canvas, meta.toUpperCase(), imgX, ty, imgW, {
        color: metaColor,
        size: perPage === 4 ? 15 : 17,
        maxLines: 1,
        align,
        letterSpacing: 2,
      });
    }
  }

  // Pied de page : titre + numéro.
  drawText(canvas, title.toUpperCase(), PAD, H - PAD - 24, contentW * 0.7, {
    color: muted,
    size: 18,
    maxLines: 1,
    letterSpacing: 3,
  });
  drawText(canvas, String(pageNo), PAD + contentW * 0.7, H - PAD - 24, contentW * 0.3, {
    color: muted,
    size: 18,
    align: TextAlign.Right,
    maxLines: 1,
  });

  return encodeSurface(surface, title, pageNo);
}

async function renderCover(
  photos: Photo[],
  options: ExportOptions,
  title: string,
  pro: boolean,
  coverPhotoId?: string,
): Promise<PagePayload | null> {
  const surface = Skia.Surface.Make(W, H);
  if (!surface) return null;
  const canvas = surface.getCanvas();

  const count = photos.length
    ? `${photos.length} photo${photos.length > 1 ? 's' : ''}`
    : '';

  if (pro) {
    // Couverture sobre de rapport : fond blanc, titre et méta factuelles.
    const bg = Skia.Paint();
    bg.setColor(Skia.Color('#ffffff'));
    canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bg);
    const today = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    let ty = 260;
    ty +=
      drawText(canvas, 'RAPPORT PHOTOGRAPHIQUE', PAD, ty, W - 2 * PAD, {
        color: '#6b7280',
        size: 24,
        bold: true,
        letterSpacing: 6,
        maxLines: 1,
      }) + 16;
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
      drawText(canvas, `Établi le ${today}`, PAD, ty, W - 2 * PAD, {
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

  const cover = photos.find((p) => p.id === coverPhotoId) ?? photos[0];
  if (cover) {
    const img = await loadImage(cover.uri);
    drawCoverImage(canvas, img, PAD, PAD, W - 2 * PAD, 1040, 40);
  }

  let ty = PAD + 1040 + 60;
  ty += drawText(canvas, 'ALBUM PHOTO', PAD, ty, W - 2 * PAD, {
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
    size: 84,
    align: TextAlign.Center,
    maxLines: 2,
  });
  ty += 16;
  drawText(canvas, count, PAD, ty, W - 2 * PAD, {
    color: muted,
    size: 28,
    align: TextAlign.Center,
    maxLines: 1,
  });

  return encodeSurface(surface, title, 0);
}

function encodeSurface(
  surface: ReturnType<typeof Skia.Surface.Make>,
  title: string,
  pageNo: number,
): PagePayload | null {
  if (!surface) return null;
  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, 92);
  const suffix = pageNo === 0 ? '00-couverture' : String(pageNo).padStart(2, '0');
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
  // En mode pro : gabarit imposé (fond blanc, sans cadre, 2 photos/page).
  const eff: ExportOptions = pro
    ? { ...options, background: '#ffffff', frame: 'none' }
    : options;
  const perPage = pro ? 2 : PER_PAGE[options.photoSize];

  await push(await renderCover(photos, eff, title, pro, coverPhotoId));

  const pages = paginatePhotos(photos, perPage);
  let numbered = 0;
  for (let i = 0; i < pages.length; i++) {
    await push(
      await renderPhotoPage(pages[i], eff, title, i + 1, perPage, pro, numbered),
    );
    numbered += pages[i].length;
  }

  return uris;
}

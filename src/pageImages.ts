import {
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
import { paginateEntries, PER_PAGE } from './paginate';
import { albumFileBase } from './pdf';
import { MONTSERRAT_500, MONTSERRAT_800 } from './montserratFonts';

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
      // Montserrat embarquée (500 corps / 800 titres), pour coller au PDF.
      tfRegular =
        Skia.Typeface.MakeFreeTypeFaceFromData(
          Skia.Data.fromBase64(MONTSERRAT_500),
        ) ?? undefined;
      tfBold =
        Skia.Typeface.MakeFreeTypeFaceFromData(
          Skia.Data.fromBase64(MONTSERRAT_800),
        ) ?? undefined;
    } catch {
      // Chargement impossible : Skia.Font(undefined) prendra la police par défaut.
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
    const captionH = comment || meta ? (perPage === 4 ? 92 : 122) : 0;

    const imgX = cellX + pad;
    const imgY = cellY + pad;
    const imgW = cellW - 2 * pad;
    const imgH = cellH - 2 * pad - captionH;
    // « contain » : photo entière, non rognée (comme le PDF).
    const drawn = drawContainImage(canvas, images[i], imgX, imgY, imgW, imgH);

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
    let ty = imgY + imgH + 14;
    const captionColor = whiteFrame ? '#2c2a26' : ink;
    // Date/lieu nettement lisibles (le tan clair passait inaperçu sur fond crème).
    const metaColor = dark ? '#cbc5b8' : '#6b6456';
    const align =
      options.frame === 'polaroid' ? TextAlign.Center : TextAlign.Left;
    // Alignement de la date/lieu selon l'option (Gauche/Centre/Droite).
    const dateAlign =
      options.dateAlign === 'center'
        ? TextAlign.Center
        : options.dateAlign === 'right'
          ? TextAlign.Right
          : TextAlign.Left;
    if (comment) {
      ty += drawText(canvas, comment, imgX, ty, imgW, {
        color: captionColor,
        size: perPage === 4 ? 28 : 34,
        maxLines: 2,
        align,
      });
      ty += 6;
    }
    if (meta) {
      drawText(canvas, meta.toLowerCase(), imgX, ty, imgW, {
        color: metaColor,
        size: perPage === 4 ? 10 : 11,
        maxLines: 1,
        align: dateAlign,
        letterSpacing: 1,
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
    size: 76,
    align: TextAlign.Center,
    bold: true,
    maxLines: 2,
  });
  // Année (ou plage d'années) en gras sous le titre, comme dans l'aperçu.
  const years = photos.map((p) => new Date(photoDate(p)).getFullYear());
  const yearLabel = years.length
    ? Math.min(...years) === Math.max(...years)
      ? `${Math.min(...years)}`
      : `${Math.min(...years)} – ${Math.max(...years)}`
    : '';
  if (yearLabel) {
    ty += 16;
    drawText(canvas, yearLabel, PAD, ty, W - 2 * PAD, {
      color: accent,
      size: 52,
      align: TextAlign.Center,
      bold: true,
      letterSpacing: 4,
      maxLines: 1,
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
  const bodyFont = Skia.Font(typefaceFor(false), bodySize);
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

  const comment = limitWords(item.comment, 15);
  if (comment) {
    drawText(canvas, comment, PAD, H - capH + 54, W - 2 * PAD, {
      color: ink,
      size: 28,
      align: TextAlign.Center,
      maxLines: 2,
    });
  }
  return encodeSurface(surface, title, pageNo);
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
  const full = !pro && options.photoSize === 'full';

  const photoEntries = photos.filter((p) => p.kind !== 'text');
  await push(await renderCover(photoEntries, eff, title, pro, coverPhotoId));

  // La photo de couverture ne réapparaît dans les pages que si elle porte un
  // commentaire ; sinon elle n'est visible que sur la couverture.
  const coverPhoto =
    photoEntries.find((p) => p.id === coverPhotoId) ?? photoEntries[0];
  const pageSource =
    !pro && coverPhoto && coverPhoto.comment.trim().length === 0
      ? photos.filter((p) => p.id !== coverPhoto.id)
      : photos;

  // Les pages de texte s'intercalent dans les deux rendus (familial et pro).
  const pages = paginateEntries(pageSource, perPage);
  let numbered = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page.type === 'text') {
      await push(renderTextPage(page.item, eff, title, i + 1));
      continue;
    }
    if (full) {
      await push(await renderFullPage(page.items[0], eff, title, i + 1));
      continue;
    }
    await push(
      await renderPhotoPage(page.items, eff, title, i + 1, perPage, pro, numbered),
    );
    numbered += page.items.length;
  }

  return uris;
}

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type {
  ExportOptions,
  PageFormat,
  Photo,
  PhotoSize,
  ProPhotoSize,
} from './types';
import { readPrintBase64 } from './photoFiles';
import { fileDateStamp, formatPhotoDate, photoDate } from './dateFormat';
import { dict, localeTag, SUPPORTED, type Lang } from './i18n';
import {
  pageBackground,
  paginateEntries,
  PER_PAGE,
  paginateProEntries,
  PRO_LAYOUT,
  proFrameH,
  PRO_SMALL_DT,
} from './paginate';
import { MONTSERRAT_500, MONTSERRAT_800 } from './montserratFonts';
import { CAVEAT_400, CAVEAT_700, LORA_400, LORA_700 } from './albumFonts';
import { richToHtml } from './richText';
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
  type MapRect,
} from './albumMap';
import { mapImagesFor } from './mapSnapshot';
import {
  CAPTION_INK,
  COMMENT_BASE,
  ALBUM_CREDIT,
  LOGO_MARK_SCALE,
  LOGO_MARK_SVG,
  COMMENT_SCALE,
  coverTitleLayout,
  COVER_W,
  PRO_TEXT_SCALE,
  commentShrink,
  coverPicks,
  effectiveCover,
  famsUsed,
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
  LISERET,
  mutedInk,
  PHOTO_RADIUS,
  type FontFam,
} from './albumStyle';
import {
  effectiveFormat,
  heightCut,
  isSquare,
  PAGE_FORMATS,
  pageHeight,
} from './pageFormat';

/** Polices embarquées en base64 par famille (graisse normale + grasse), pour un
 *  rendu identique et hors-ligne dans le PDF/aperçu. */
const FACES: Record<FontFam, { name: string; regular: [number, string]; bold: [number, string] }> = {
  sans: { name: 'Montserrat', regular: [500, MONTSERRAT_500], bold: [800, MONTSERRAT_800] },
  serif: { name: 'Lora', regular: [400, LORA_400], bold: [700, LORA_700] },
  script: { name: 'Caveat', regular: [400, CAVEAT_400], bold: [700, CAVEAT_700] },
};

/** Pile CSS d'une famille (Georgia en secours si la police ne charge pas). */
const FAM_CSS: Record<FontFam, string> = {
  sans: "'Montserrat', Georgia, serif",
  serif: "'Lora', Georgia, serif",
  script: "'Caveat', 'Lora', Georgia, cursive",
};

function fontFaces(fams: FontFam[]): string {
  return fams
    .flatMap((fam) => {
      const f = FACES[fam];
      return [f.regular, f.bold].map(
        ([weight, b64]) => `
  @font-face { font-family: '${f.name}'; font-weight: ${weight}; font-style: normal;
    src: url(data:font/ttf;base64,${b64}) format('truetype'); }`,
      );
    })
    .join('');
}

/** Montserrat seule : gabarit pro, dont la typographie ne change pas. */
const MONTSERRAT_FACE = fontFaces(['sans']);

/**
 * Politique de sécurité du document (aperçu WebView **et** PDF `expo-print`).
 *
 * Le HTML ne contient que du statique : styles en ligne, polices et photos en
 * `data:`. Tout le reste est interdit — aucun script, aucune connexion réseau,
 * aucune ressource externe. Défense en profondeur : si une valeur non échappée
 * se glissait un jour dans le document, elle ne pourrait ni s'exécuter ni
 * envoyer l'album ailleurs. ⚠️ Ajouter une ressource non `data:` au gabarit
 * exige d'élargir cette règle, sinon elle ne s'affichera pas.
 */
const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
  "img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\" />";

/** Tronque un texte à `n` mots (pour la légende en pleine page). */
function limitWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= n ? text.trim() : `${words.slice(0, n).join(' ')}…`;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  style: 'family',
  photoSize: 'medium',
  background: '#f6f1e9',
  frame: 'card',
  liseret: false,
  showPlace: true,
  dateFormat: 'long',
  dateAlign: 'left',
  textAlign: 'center',
  commentVAlign: 'top',
  typeface: 'sans',
  cover: 'classic',
  commentSize: 'large',
  showMap: false,
  photoMaps: false,
  format: 'a4',
  proTextSize: 'normal',
  proTextBold: false,
};

/** Garde la valeur si elle fait partie des choix connus, sinon le défaut. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Ramène des options d'export de provenance incertaine à des valeurs connues.
 *
 * ⚠️ Sécurité : ces options sont **interpolées telles quelles** dans le
 * `<style>` du HTML (aperçu WebView et PDF). Or elles peuvent venir d'une
 * **sauvegarde reçue d'un tiers** (`parseBackup`) : un `background` du genre
 * `#fff}</style><script>…` injectait un script qui lisait la page — photos,
 * commentaires, lieux — et l'envoyait sur le réseau. Chaque champ est donc
 * restreint à sa liste fermée (couleur = hex à 6 chiffres), toute autre valeur
 * retombant sur le défaut.
 */
export function sanitizeExportOptions(raw: unknown): ExportOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_EXPORT_OPTIONS;
  const align = ['left', 'center', 'right'] as const;
  return {
    style: oneOf(o.style, ['family', 'pro'] as const, d.style),
    photoSize: oneOf(o.photoSize, ['small', 'medium', 'large', 'full'] as const, d.photoSize),
    background:
      typeof o.background === 'string' && /^#[0-9a-f]{6}$/i.test(o.background)
        ? o.background
        : d.background,
    frame: oneOf(o.frame, ['card', 'border', 'polaroid', 'none'] as const, d.frame),
    liseret: typeof o.liseret === 'boolean' ? o.liseret : d.liseret,
    showPlace: typeof o.showPlace === 'boolean' ? o.showPlace : d.showPlace,
    dateFormat: oneOf(
      o.dateFormat,
      ['dayMonth', 'short', 'shortTime', 'long', 'full', 'none'] as const,
      d.dateFormat,
    ),
    dateAlign: oneOf(o.dateAlign, align, d.dateAlign),
    textAlign: oneOf(o.textAlign, align, d.textAlign),
    commentVAlign: oneOf(o.commentVAlign, ['top', 'middle', 'bottom'] as const, d.commentVAlign),
    typeface: oneOf(o.typeface, ['sans', 'serif', 'script'] as const, d.typeface),
    commentSize: oneOf(o.commentSize, ['normal', 'large', 'xlarge'] as const, d.commentSize),
    cover: oneOf(o.cover, ['classic', 'scatter', 'filmstrip'] as const, d.cover),
    showMap: typeof o.showMap === 'boolean' ? o.showMap : d.showMap,
    photoMaps: typeof o.photoMaps === 'boolean' ? o.photoMaps : d.photoMaps,
    format: oneOf(o.format, ['a4', '16x21', '16x16'] as const, d.format),
    proTextSize: oneOf(o.proTextSize, ['normal', 'large', 'xlarge'] as const, d.proTextSize),
    proTextBold: typeof o.proTextBold === 'boolean' ? o.proTextBold : d.proTextBold,
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br/>');
}

/** Période couverte par l'album (ex. « mai – juin 2026 »), pour la couverture. */
export function formatRange(photos: Photo[], lang: Lang): string {
  const times = photos.map(photoDate);
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  const monthYear = (d: Date) =>
    d.toLocaleDateString(localeTag(lang), { month: 'long', year: 'numeric' });
  return monthYear(first) === monthYear(last)
    ? monthYear(first)
    : `${monthYear(first)} – ${monthYear(last)}`;
}

/** Vrai si la couleur (hex 6 chiffres) est sombre — pour adapter le texte. */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

interface Item {
  photo: Photo;
  src: string;
  /** Carte à côté de la photo (HTML prêt à poser), vide sinon. */
  map?: string;
}

/** Options de rendu d'une page photo (familial). */
interface PageCtx {
  dateFormat: ExportOptions['dateFormat'];
  showPlace: boolean;
  frame: ExportOptions['frame'];
  lang: Lang;
  /** Aperçu interactif : photos cliquables (liens `comclic-edit://`). */
  interactive: boolean;
  /** Entrées de la page en cours (le fond est commun à toute la page). */
  pageIds?: string[];
}

/**
 * Lien d'édition de l'aperçu : l'entrée touchée puis toutes celles de sa page
 * (un nouveau fond de page remplace celui des voisines). Ids : chiffres,
 * lettres et tirets (cf. `newId`).
 */
function editHref(id: string, pageIds: string[] = [id]): string {
  return `comclic-edit://e/${encodeURIComponent(id)}/${pageIds.map(encodeURIComponent).join(',')}`;
}

/** Attributs d'une page à fond propre : classe + couleurs de ce fond. */
function paintAttrs(bg: string | undefined, frame: ExportOptions['frame']): {
  cls: string;
  style: string;
} {
  return bg ? { cls: ' painted', style: ` style="${themeVars(bg, frame)}"` } : { cls: '', style: '' };
}

function figureHtml(item: Item, variant: '' | 'solo' | 'large', ctx: PageCtx): string {
  const { dateFormat, showPlace, lang } = ctx;
  const { photo, src, map } = item;
  const comment = photo.comment.trim();
  const place = showPlace ? photo.place?.trim() : undefined;
  const date = formatPhotoDate(photoDate(photo), dateFormat, lang);
  const img = src
    ? `<img src="${src}" />`
    : `<span class="missing">${dict(lang).doc.imageUnavailable}</span>`;
  const meta = [place, date].filter(Boolean).join(' · ');
  const caption =
    comment || meta
      ? `<figcaption class="caption">
          ${comment ? richToHtml(comment, escapeHtml) : ''}
          ${meta ? `<span class="date">${escapeHtml(meta)}</span>` : ''}
        </figcaption>`
      : '';
  // Carte du lieu : partage la bande de la photo (photo à gauche, carte à droite).
  const ph = map
    ? `<div class="ph split"><div class="ph-photo">${img}</div><div class="ph-map">${map}</div></div>`
    : `<div class="ph">${img}</div>`;
  const body = ctx.interactive
    ? `<a class="edit" href="${editHref(photo.id, ctx.pageIds)}">${ph}${caption}</a>`
    : `${ph}${caption}`;
  return `
    <figure class="card ${variant}${map ? ' wide' : ''}" id="e-${escapeHtml(photo.id)}">
      ${body}
    </figure>`;
}

function pageHtml(
  group: Item[],
  size: PhotoSize,
  solo: boolean,
  pageNo: number,
  ctx: PageCtx,
): string {
  const perPage = PER_PAGE[size];
  // Page d'une seule photo : « large » si c'est la taille choisie, « solo »
  // (agrandie) seulement si la pagination l'a voulu (cf. `AlbumPage.solo`).
  const variant = perPage === 1 ? 'large' : solo ? 'solo' : '';
  const pageCtx = { ...ctx, pageIds: group.map((it) => it.photo.id) };
  const figures = group
    .map((item) => figureHtml(item, variant, pageCtx))
    .join('');
  // En taille « petite », les photos s'organisent en grille 2 colonnes — même
  // seule sur sa page, une petite photo garde sa case.
  const body = perPage === 4 && !solo ? `<div class="grid4">${figures}</div>` : figures;
  const paint = paintAttrs(pageBackground(group.map((it) => it.photo)), ctx.frame);
  return `
    <section class="sheet photos sz-${size}${paint.cls}"${paint.style}>
      ${body}
      <p class="footer"><span>${pageNo}</span></p>
    </section>`;
}

/** Photo pleine page (bord à bord) + légende courte (≤ 15 mots) en pied. */
function fullPageHtml(item: Item, ctx: PageCtx): string {
  const { photo, src, map } = item;
  const { lang } = ctx;
  const comment = limitWords(photo.comment, 15);
  const img = src
    ? `<img src="${src}" />`
    : `<span class="missing">${dict(lang).doc.imageUnavailable}</span>`;
  // Pleine page : la carte se pose en médaillon dans le coin de la photo.
  const inset = map ? `<div class="full-map">${map}</div>` : '';
  const inner = `<div class="full-img">${img}${inset}</div>
      <div class="full-cap">${comment ? richToHtml(comment, escapeHtml) : ''}</div>`;
  const paint = paintAttrs(pageBackground([photo]), ctx.frame);
  return `
    <section class="sheet full-sheet${paint.cls}" id="e-${escapeHtml(photo.id)}"${paint.style}>
      ${ctx.interactive ? `<a class="edit" href="${editHref(photo.id)}">${inner}</a>` : inner}
    </section>`;
}

/** Page de texte seule (intro, dédicace, séparateur…). */
function textPageHtml(item: Photo, pageNo: number, ctx: PageCtx): string {
  const text = escapeHtml(item.comment.trim()).replace(/\n/g, '<br/>');
  const body = `<div class="textpage-body">${text}</div>`;
  const paint = paintAttrs(pageBackground([item]), ctx.frame);
  return `
    <section class="sheet textpage tv-${item.textVAlign ?? 'middle'}${paint.cls}" id="e-${escapeHtml(item.id)}"${paint.style}>
      ${ctx.interactive ? `<a class="edit" href="${editHref(item.id)}">${body}</a>` : body}
      <p class="footer"><span>${pageNo}</span></p>
    </section>`;
}

/**
 * Page A4 en points PDF (72 dpi) : les px CSS correspondent à ces unités,
 * ce qui permet de dimensionner les pages au pixel près. L'unité vh est
 * proscrite : elle dépend de la fenêtre du moteur de rendu, pas de la page,
 * et provoquait pages blanches et chevauchements.
 */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
// Hauteur d'une page selon le format : `pageHeight(effectiveFormat(options))`.

/**
 * Aperçu : chaque page posée comme une feuille sur un plan de travail neutre —
 * format exact, fond propre, ombre, écart régulier — pour voir où une page
 * finit et où la suivante commence. Écran seulement : le PDF envoyé est
 * construit sans (`interactive` faux) et garde sa pagination par sauts.
 */
const DESK_GAP = 14;
const deskCss = (pageH: number) => `
  body.desk { background: #cdc7bc; padding: ${DESK_GAP}px ${DESK_GAP}px 2px; }
  body.desk .sheet {
    width: ${PAGE_WIDTH}px; height: ${pageH}px; overflow: hidden;
    background: var(--bg); color: var(--ink);
    margin: 0 0 ${DESK_GAP + 4}px;
    box-shadow: 0 0 0 1px rgba(31,29,26,0.12), 0 3px 12px rgba(31,29,26,0.28);
  }`;

/** Hauteur de la zone image (px) selon la taille choisie. */
/**
 * Hauteur de la bande réservée au commentaire quand il est centré ou aligné en
 * bas (≈ 2 lignes de légende + la ligne date/lieu). En position « haut » aucune
 * bande n'est posée : la légende coule comme avant, rendu strictement identique.
 */
const CAPTION_BANDS: Record<ExportOptions['photoSize'], number> = {
  small: 58,
  medium: 66,
  large: 66,
  full: 0, // la pleine page a son propre bandeau (.full-cap)
};

/**
 * Hauteur qu'occupe déjà une légende d'une ligne. La bande ne coûte donc que la
 * différence, retranchée à la photo : la carte garde sa hauteur et la
 * pagination ne bouge pas (une page en plus casserait le montage).
 */
const CAPTION_BASES: Record<ExportOptions['photoSize'], number> = {
  small: 35,
  medium: 38,
  large: 38,
  full: 0,
};

/**
 * Hauteurs de la zone image en page carrée (16 × 16) : la page n'a que 594
 * unités de haut, les moyennes s'y posent côte à côte (une seule rangée).
 */
const SQUARE_PH: Record<PhotoSize | 'solo', number> = {
  small: 160,
  medium: 300,
  large: 380,
  full: 380, // non utilisé (la pleine page a son propre gabarit)
  solo: 280,
};

const PH_HEIGHTS: Record<ExportOptions['photoSize'], string> = {
  small: '170px',
  medium: '250px',
  large: '500px',
  full: '500px', // non utilisé (la pleine page a son propre gabarit)
};

/**
 * Couleurs d'une page selon son fond, en propriétés CSS (`--ink`…). Posées sur
 * `body` pour le fond de l'album, et **sur la page elle-même** quand elle a son
 * propre fond (`Photo.pageBg`) : un fond sombre éclaircit alors le texte de
 * cette page seulement. Valeurs calculées (hex/rgba), jamais saisies.
 */
function themeVars(bg: string, frame: ExportOptions['frame']): string {
  const dark = isDark(bg);
  const ink = dark ? '#f3efe7' : '#1f1d1a';
  // Cadres à fond blanc : texte sombre quel que soit le fond de page.
  const whiteFrame = frame === 'card' || frame === 'polaroid';
  const vars: Record<string, string> = {
    '--bg': bg,
    '--ink': ink,
    '--muted': mutedInk(bg),
    '--accent': dark ? '#e3a455' : '#b45309',
    '--cap-ink': whiteFrame ? CAPTION_INK : dark ? ink : CAPTION_INK,
    '--meta-ink': !whiteFrame && dark ? META_INK_DARK : META_INK,
    '--full-ink': dark ? ink : CAPTION_INK,
    '--border': dark ? 'rgba(243,239,231,0.55)' : 'rgba(31,29,26,0.4)',
    '--shadow': dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.24)',
  };
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
}

const SIZES: PhotoSize[] = ['small', 'medium', 'large'];

/**
 * Hauteurs d'une taille de photo, sous `.sz-<taille>` : depuis la taille par
 * photo (aperçu), des pages de tailles différentes cohabitent dans un album.
 */
function sizeCss(size: PhotoSize, options: ExportOptions): string {
  const spec = TYPE_SPECS[options.typeface];
  const vAlign = options.commentVAlign ?? 'top';
  // Position verticale du commentaire : « haut » = flux d'origine, sans bande.
  const band = vAlign === 'top' ? 0 : CAPTION_BANDS[size];
  const baseSize = size === 'small' ? COMMENT_BASE.small : COMMENT_BASE.other;
  // Bande de position + place d'un commentaire plus grand, prises sur la photo :
  // la carte garde sa hauteur, la pagination ne bouge pas.
  const shrink =
    (band ? band - CAPTION_BASES[size] : 0) +
    commentShrink(baseSize, options.typeface, options.commentSize);
  const captionSize =
    Math.round(baseSize * spec.captionScale * COMMENT_SCALE[options.commentSize] * 10) / 10;
  // Format moins haut que l'A4 : la hauteur perdue est prise sur les photos —
  // partagée entre les deux rangées (petite, moyenne), entière pour une photo
  // agrandie (commentaire long : il lui faut sa marge), à moitié pour la grande
  // (sa page gardait déjà du blanc en A4). Les légendes gardent leur place : la
  // pagination ne change pas.
  const format = effectiveFormat(options);
  const cut = heightCut(format);
  const rowCut = size === 'large' ? cut : Math.round(cut / 2);
  // Page carrée : hauteurs propres (moyennes côte à côte, cf. `.fmt-square`).
  const square = isSquare(format);
  const ph = square ? SQUARE_PH[size] : parseInt(PH_HEIGHTS[size], 10) - rowCut;
  const solo = square ? SQUARE_PH.solo : 380 - cut;
  const large = square ? SQUARE_PH.large : 480 - Math.round(cut / 2);
  const z = `.sz-${size}`;
  return `
  ${z} .card { margin-bottom: ${size === 'small' ? 12 : 16}px; }
  ${z} .ph { height: ${ph - shrink}px; }
  ${z} .card.solo .ph { height: ${solo - shrink}px; }
  ${z} .card.large .ph { height: ${large - shrink}px; }
  ${z} .caption { font-size: ${captionSize}px; }
  ${
    band
      ? `${z} .caption {
    min-height: ${band}px; display: flex; flex-direction: column;
    justify-content: ${vAlign === 'middle' ? 'center' : 'flex-end'};
  }`
      : ''
  }`;
}

/**
 * Construit la feuille de style du mini album à partir des options :
 * hauteurs fixes uniquement (jamais de flex vertical), pour que le contenu
 * ne déborde jamais sur la page suivante. Couleurs en variables (`themeVars`),
 * hauteurs par taille (`sizeCss`).
 */
function buildStyles(options: ExportOptions): string {
  // Couverture et page de fin : sur le fond de l'album (variables du `body`).
  const dark = isDark(options.background);
  // Typographie : une famille par rôle (titre, légende, texte long, date).
  const spec = TYPE_SPECS[options.typeface];
  const fam = (f: FontFam) => FAM_CSS[f];
  const regular = (f: FontFam) => FACES[f].regular[0];
  const bold = (f: FontFam) => FACES[f].bold[0];
  const commentScale = COMMENT_SCALE[options.commentSize];
  // Format de page : hauteur des pages, et hauteur perdue sur l'A4 que les
  // gabarits verticaux (couverture, pleine page, fin) retranchent.
  const format = effectiveFormat(options);
  const pageH = pageHeight(format);
  const cut = heightCut(format);
  const captionWeight = spec.captionBold ? bold(spec.caption) : regular(spec.caption);

  // Encadré : les cadres à fond blanc gardent un texte sombre (`--cap-ink`) ;
  // les cadres transparents (bordure, sans cadre) prennent celui de la page.
  let frameCss = '';
  switch (options.frame) {
    case 'card':
      frameCss = `
        .card { background: #fff; border-radius: 16px; padding: 10px;
          box-shadow: 0 8px 22px var(--shadow); }
        .ph { border-radius: ${PHOTO_RADIUS.card}px; }`;
      break;
    case 'border':
      frameCss = `
        .card { border: 2px solid var(--border); border-radius: 16px; padding: 10px; }
        .ph { border-radius: ${PHOTO_RADIUS.border}px; }`;
      break;
    case 'polaroid':
      // Cadre blanc épais, façon scrapbook. Les photos empilées (2 ou 4/page)
      // sont légèrement inclinées en alternance ; les photos seules (grande
      // taille ou page « solo ») restent DROITES et centrées.
      frameCss = `
        .card { background: #fff; border-radius: 3px; padding: 14px 14px 18px;
          box-shadow: 0 10px 24px var(--shadow); }
        .card:not(.large):not(.solo):nth-of-type(odd) { transform: rotate(-1.4deg); }
        .card:not(.large):not(.solo):nth-of-type(even) { transform: rotate(1.1deg); }
        .card.large, .card.solo { transform: none; margin-left: auto; margin-right: auto; }
        .ph { border-radius: ${PHOTO_RADIUS.polaroid}px; }`;
      break;
    case 'none':
      frameCss = `
        .card { padding: 0; }
        .ph { border-radius: ${PHOTO_RADIUS.none}px; }`;
      break;
  }

  return `
  ${fontFaces(famsUsed(options.typeface))}
  /* iOS agrandit d'office les petits textes d'une page réduite à l'écran
     (« text autosizing ») : l'aperçu ne montrait plus les vraies tailles. */
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  * {
    box-sizing: border-box;
    /* Indispensable : sans cela, le moteur d'impression iOS supprime les
       couleurs de fond et les ombres du PDF. */
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact;
  }
  body {
    ${themeVars(options.background, options.frame)}
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: ${fam(spec.meta)}; font-weight: ${regular(spec.meta)};
  }
  figure { margin: 0; }
  /* Pas de hauteur imposée : le contenu (dimensionné en px, total < page)
     s'arrête avant le bas, et le saut de page force la suite. */
  .sheet { padding: 24px 28px 0; page-break-after: always; }
  .sheet:last-of-type { page-break-after: auto; }
  /* Page à fond propre : hauteur de page exacte, pour que la couleur la
     couvre jusqu'en bas (le fond du body reste celui de l'album). */
  .sheet.painted { height: ${pageH}px; overflow: hidden; background: var(--bg); color: var(--ink); }
  .footer {
    display: flex; justify-content: center; align-items: center;
    margin: 6px 4px 0; font-size: 10px; letter-spacing: 2.5px;
    text-transform: uppercase; color: var(--muted);
  }
  /* Aperçu : chaque photo est un lien interne (comclic-edit://) que l'app
     intercepte — aucun script dans la page. Absent du PDF. */
  a.edit { display: block; color: inherit; text-decoration: none; }

  /* --- 1ère de couverture (titre + année + montage, façon carnet) --- */
  /* Couverture classique : feuille de la hauteur de la page, en colonne. La
     photo garde sa hauteur d'origine (flex-basis) mais cède ce qu'il faut à un
     titre long ou coupé sur plusieurs lignes — mesuré, pas estimé : la page ne
     déborde jamais. */
  .cover {
    position: relative; height: ${pageH}px; padding: 62px 46px 60px; text-align: center;
    display: flex; flex-direction: column;
  }
  .crop { position: absolute; width: 22px; height: 22px; border: 0 solid var(--ink); }
  .crop.tl { top: 26px; left: 26px; border-top-width: 1.5px; border-left-width: 1.5px; }
  .crop.tr { top: 26px; right: 26px; border-top-width: 1.5px; border-right-width: 1.5px; }
  .crop.bl { bottom: 26px; left: 26px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
  .crop.br { bottom: 26px; right: 26px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
  .cover-kicker {
    margin: 14px 0 0; font-family: "Courier New", monospace;
    font-size: 12px; letter-spacing: 5px; color: var(--accent); font-weight: 700;
  }
  .cover-title {
    margin: 16px 0 0; font-family: ${fam(spec.title)};
    font-weight: ${bold(spec.title)}; font-size: ${58 * spec.titleScale}px; line-height: 1.04;
    letter-spacing: 0.5px; color: var(--ink);
  }

  /* --- Couvertures montées (pêle-mêle, grille) : gabarit calculé dans
     albumStyle.ts, posé en absolu pour coller au rendu Skia --- */
  .cover-abs { position: relative; height: ${pageH}px; padding: 0; overflow: hidden; }
  .cv-head {
    position: absolute; top: ${SCATTER_TITLE.top}px;
    left: ${SCATTER_TITLE.side}px; right: ${SCATTER_TITLE.side}px; text-align: center;
  }
  .cover-abs .cover-title { margin: 0; font-size: ${SCATTER_TITLE.size * spec.titleScale}px; }
  .grid-head .cover-title { font-size: ${GRID.titleSize * spec.titleScale}px; }
  .pola {
    position: absolute; margin: 0; background: #fff; border-radius: 2px;
    padding: ${POLAROID.pad}px ${POLAROID.pad}px ${POLAROID.bottom}px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, ${dark ? '0.55' : '0.26'});
  }
  .pola img, .cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cell { position: absolute; overflow: hidden; background: rgba(31,29,26,0.08); }
  .cover-hero {
    flex: 0 1 ${470 - cut}px; min-height: 120px; margin: 40px 0 0; overflow: hidden;
    border: 6px solid #fff; box-shadow: 0 8px 22px rgba(0, 0, 0, ${dark ? '0.55' : '0.22'});
  }
  .cover-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-foot {
    display: flex; justify-content: space-between; align-items: center;
    margin: 42px 6px 0; font-family: 'Montserrat', Georgia, serif;
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted);
  }
  .cover-foot .reg {
    width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--accent);
  }

  /* --- Pages photo : hauteurs fixes (par taille, cf. sizeCss) --- */
  /* Photos centrées sur la page, quelle que soit leur taille : la feuille a la
     hauteur exacte de la page, le bloc de photos s'y centre entre le haut et
     le numéro (posé en pied, hors du flux). La hauteur fixe garantit qu'aucun
     contenu ne glisse sur la page suivante (cf. tailles de sizeCss). */
  .sheet.photos {
    height: ${pageH}px; overflow: hidden; position: relative;
    padding: 24px 28px 48px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .sheet.photos > .card:last-of-type { margin-bottom: 0; }
  .sheet.photos .footer { position: absolute; left: 0; right: 0; bottom: 22px; margin: 0; }
  .card.solo, .card.large { margin-left: auto; margin-right: auto; width: 100%; }
  /* Grille des petites : une rangée incomplète se centre aussi. */
  .grid4 { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }

  /* --- Page carrée (16 × 16) : photos moyennes côte à côte, la carte sous la
     photo (une colonne n'a pas la largeur de les mettre côte à côte), couverture
     classique resserrée. Mêmes cases que Skia (gridFor, carte dessous). --- */
  .fmt-square .sheet.photos.sz-medium {
    flex-direction: row; align-items: center; justify-content: center; gap: 16px;
  }
  .fmt-square .sheet.photos.sz-medium > .card {
    flex: 0 1 calc(50% - 8px); margin-bottom: 0;
  }
  .fmt-square .sheet.photos.sz-medium > .card.solo { flex-basis: 100%; }
  .fmt-square .sz-medium .card:not(.solo) .ph.split { flex-direction: column; }
  .fmt-square .sz-medium .card:not(.solo) .ph.split .ph-photo { flex: ${1 - MAP_SHARE} 1 0; width: 100%; }
  .fmt-square .sz-medium .card:not(.solo) .ph.split .ph-map { flex: ${MAP_SHARE} 1 0; width: 100%; }
  .fmt-square .cover { padding-top: 40px; }
  .fmt-square .cover-hero { margin-top: 24px; flex-basis: ${470 - cut + 54}px; }
  .fmt-square .cover-foot { margin-top: 22px; }
  .grid4 .card { width: calc(50% - 6px); margin-bottom: 4px; }
  ${frameCss}
  /* Case photo sans fond : une photo qui n'a pas les proportions de sa case
     (portrait dans une case horizontale…) se pose au centre, sur le fond de
     la carte ou de la page. Un aplat gris comblait le vide et salissait la
     mise en page. L'image prend sa taille réelle (bornée par la case) : les
     coins arrondis tombent sur la photo elle-même. */
  .ph {
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .ph img {
    width: auto; height: auto; max-width: 100%; max-height: 100%;
    display: block; border-radius: inherit;
  }
  .card.solo { max-width: 460px; }
  .card.solo .ph img { object-fit: contain; }
  .card.large .ph img { object-fit: contain; }
  .missing { color: var(--muted); font-style: italic; font-size: 13px; }
  /* Commentaire aligné selon « Alignement des textes » (la date/lieu garde
     son propre réglage, cf. .caption .date). */
  .caption {
    margin: 8px 4px 2px; line-height: ${spec.lineHeight};
    text-align: ${options.textAlign};
    font-family: ${fam(spec.caption)}; font-weight: ${captionWeight};
    color: var(--cap-ink);
  }
  ${SIZES.map((size) => sizeCss(size, options)).join('')}
  .caption strong, .full-cap strong { font-weight: ${bold(spec.caption)}; }
  .caption u, .meta u, .full-cap u { text-decoration: underline; }
  /* Lieu · date : dans la typographie du texte choisie (spec.date). */
  .caption .date {
    display: block; margin-top: 4px; font-size: ${Math.round(META_SIZE * spec.dateScale * 10) / 10}px;
    line-height: 1.3; text-align: ${options.dateAlign ?? 'left'};
    font-family: ${fam(spec.date)};
    letter-spacing: ${spec.date === 'script' ? 0.2 : 0.6}px; text-transform: lowercase;
    font-weight: ${spec.captionBold ? bold(spec.date) : regular(spec.date)};
    color: var(--meta-ink);
  }

  /* --- Photo pleine page (bord à bord) --- */
  .full-sheet { padding: 0; page-break-after: always; }
  .full-sheet:last-of-type { page-break-after: auto; }
  .full-img { position: relative; height: ${778 - cut}px; overflow: hidden; }
  .full-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .full-cap {
    height: 64px; padding: 0 44px; display: flex; align-items: center; justify-content: center;
    font-size: ${Math.round(14 * spec.captionScale * commentScale * 10) / 10}px; line-height: 1.4;
    text-align: center; color: var(--full-ink);
    font-family: ${fam(spec.caption)}; font-weight: ${captionWeight};
  }

  /* --- Page de texte seule (texte centré verticalement sur la page) --- */
  .textpage {
    position: relative; height: ${pageH}px; padding: 90px 60px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    page-break-after: always;
  }
  .textpage:last-of-type { page-break-after: auto; }
  /* Position du texte choisie dans l'aperçu (milieu par défaut). */
  .textpage.tv-top { justify-content: flex-start; }
  .textpage.tv-bottom { justify-content: flex-end; }
  .textpage .footer { position: absolute; left: 0; right: 0; bottom: 30px; margin: 0; }
  .textpage a.edit { width: 100%; }
  .textpage-body {
    font-family: ${fam(spec.text)}; font-size: 21px; line-height: 1.6;
    color: var(--ink); text-align: ${options.textAlign}; white-space: pre-wrap;
  }

  /* --- Page de fin --- */
  .end {
    position: relative; height: ${pageH}px;
    text-align: center; padding-top: ${330 - Math.round(cut / 2)}px;
  }
  .end .orn { font-size: 22px; color: var(--accent); margin: 0; }
  .end h2 {
    font-family: ${fam(spec.title)}; font-weight: ${bold(spec.title)};
    font-size: 26px; margin: 12px 0 6px; color: var(--ink);
  }
  .end p { color: var(--muted); font-size: ${Math.round(13 * spec.dateScale * 10) / 10}px; margin: 0;
    font-family: ${fam(spec.date)}; }
  /* « Powered by ComClic » : corps et police des dates sous les photos. */
  .end .credit {
    position: absolute; left: 0; right: 0; bottom: 30px;
    font-family: ${fam(spec.meta)}; font-weight: ${regular(spec.meta)};
    font-size: ${META_SIZE}px; letter-spacing: 0.6px; color: var(--meta-ink);
  }
  ${CREDIT_LOGO_CSS}

  /* --- Carte à côté d'une photo (MAP_SHARE / MAP_GAP / FULL_MAP d'albumMap.ts) --- */
  .grid4 .card.wide { width: 100%; }
  .ph.split { display: flex; gap: ${MAP_GAP}px; background: transparent; align-items: stretch; }
  .ph-photo {
    flex: ${1 - MAP_SHARE} 1 0; min-width: 0; height: 100%; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    border-radius: inherit;
  }
  /* La carte prend les coins arrondis de la photo (hérités de .ph). */
  .ph-map {
    flex: ${MAP_SHARE} 1 0; min-width: 0; position: relative; overflow: hidden; height: 100%;
    border-radius: inherit;
  }
  /* Sélecteurs plus précis que .card.large .ph img et le liseré (.ph img) :
     la carte se cadre toujours « cover », sans bordure. */
  .card .ph .ph-map img.mapimg, .ph-map svg.mm, .full-img .full-map img.mapimg, .full-map svg.mm {
    position: absolute; left: 0; top: 0; width: 100%; height: 100%;
    max-width: none; max-height: none; object-fit: cover;
    border: 0; border-radius: 0; box-shadow: none;
  }
  .mpin { position: absolute; left: 50%; top: 50%; margin: -30px 0 0 -12px; }
  .full-map {
    position: absolute; right: ${FULL_MAP.margin}px; bottom: ${FULL_MAP.margin}px;
    width: ${FULL_MAP.w}px; height: ${FULL_MAP.h}px; overflow: hidden;
    outline: ${FULL_MAP.border}px solid #fff; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  }

  /* --- Carte des lieux : un SVG pleine page (cf. albumMap.ts) --- */
  .mappage { padding: 0; height: ${pageH}px; overflow: hidden; }
  .mappage svg { display: block; }
  ${
    options.liseret
      ? `/* Liseré BLANC (option additive) autour de CHAQUE photo : l'image prend
            sa taille réelle et porte une bordure blanche + une légère ombre pour
            rester visible sur tout fond. overflow:visible pour ne pas rogner
            l'ombre. Se combine avec n'importe quel support. */
         .ph, .ph-photo { background: transparent; overflow: visible; }
         .ph img { width: auto; height: auto; max-width: 100%; max-height: 100%;
           box-sizing: border-box; border-radius: ${LISERET.radius}px;
           border: ${LISERET.width}px solid #ffffff;
           box-shadow: 0 2px 8px var(--shadow); }
         /* La carte d'une photo porte le même liseré que la photo. */
         .ph-map { box-sizing: border-box; border-radius: ${LISERET.radius}px;
           border: ${LISERET.width}px solid #ffffff;
           box-shadow: 0 2px 8px var(--shadow); }`
      : ''
  }
`;
}

/**
 * Construit le HTML complet du mini album (couverture, pages photo, page de
 * fin), avec les images intégrées en base64. Réutilisé tel quel par l'aperçu
 * (WebView) et par la génération PDF, pour que l'aperçu soit fidèle au rendu.
 */
export async function buildAlbumHtml(
  photos: Photo[],
  title: string,
  options: ExportOptions,
  coverPhotoId?: string,
  lang: Lang = 'fr',
  scatterIds?: string[],
  /** Aperçu : photos cliquables pour régler taille et fond (jamais dans le PDF). */
  interactive = false,
): Promise<string> {
  // Point d'entrée unique du HTML (familial ET pro) : les réglages et la langue
  // y sont filtrés une fois pour toutes avant d'être interpolés dans le
  // document (cf. `sanitizeExportOptions`).
  options = sanitizeExportOptions(options);
  if (!SUPPORTED.includes(lang)) lang = 'fr';
  // Budget adaptatif : plus il y a de photos, plus on réduit chacune pour que le
  // PDF final reste transmissible (cible ~10 Mo). À 1600 px / q0.72 une photo
  // pèse ~0,3 Mo, donc ~3 Mo pour 9 photos (contre ~190 Mo en original brut).
  const count = photos.filter((p) => p.kind !== 'text').length;
  const maxEdge = count > 30 ? 1024 : count > 15 ? 1280 : 1600;
  const quality = count > 30 ? 0.68 : 0.72;

  const items: Item[] = await Promise.all(
    photos.map(async (photo) => {
      if (photo.kind === 'text' || !photo.uri) return { photo, src: '' };
      try {
        const b64 = await readPrintBase64(photo.uri, maxEdge, quality);
        return { photo, src: `data:image/jpeg;base64,${b64}` };
      } catch {
        return { photo, src: '' };
      }
    }),
  );

  // Rendu professionnel : gabarit sobre (fond blanc, photos numérotées, lieu +
  // description). Réglages honorés en pro : encadrement, format et position de
  // la date, alignement des pages de texte. Le reste reste imposé.
  if (options.style === 'pro') {
    return buildProDocument(items, title, options, lang, interactive);
  }

  // Cartes à côté des photos : images Apple Plans (créées une fois, gardées
  // sur le téléphone), sinon carte stylisée hors ligne.
  const mapIds = options.photoMaps ? mapPhotoIds(photos) : new Set<string>();
  if (mapIds.size) {
    const images = await mapImagesFor(photos, mapIds);
    for (const it of items) {
      if (!mapIds.has(it.photo.id)) continue;
      const uri = images.get(it.photo.id);
      let b64: string | null = null;
      if (uri) {
        try {
          b64 = await readPrintBase64(uri, 1200, 0.8);
        } catch {
          b64 = null;
        }
      }
      it.map = miniMapHtml(it.photo, b64);
    }
  }

  // Les pages de texte ne comptent pas comme des photos (couverture, année).
  const photoEntries = photos.filter((p) => p.kind !== 'text');
  const range = photoEntries.length ? formatRange(photoEntries, lang) : '';
  // Mode familial : on n'affiche pas le nombre total de photos (juste la période).
  const subtitle = range;
  // Photo de couverture : celle choisie par l'utilisateur (étoile),
  // sinon la première photo lisible du dossier.
  const coverItem =
    items.find((it) => it.photo.id === coverPhotoId && it.src) ??
    items.find((it) => it.src);
  const coverSrc = coverItem?.src ?? '';
  const coverStyle = effectiveCover(options.cover, photoEntries.length);

  // Couverture classique : la photo de couverture ne réapparaît dans les pages
  // que si elle porte un commentaire. Les montages (pêle-mêle, grille) sont un
  // avant-goût de l'album : leurs photos restent toutes dans les pages.
  const coverPhoto = coverItem?.photo;
  const pageSource =
    coverStyle === 'classic' && coverPhoto && coverPhoto.comment.trim().length === 0
      ? photos.filter((p) => p.id !== coverPhoto.id)
      : photos;

  const spec = TYPE_SPECS[options.typeface];
  const format = effectiveFormat(options);
  const pageH = pageHeight(format);
  const coverTitle = escapeHtml(spec.uppercaseTitle ? title.toUpperCase() : title);
  const srcOf = (p: Photo) => items.find((it) => it.photo.id === p.id)?.src ?? '';
  const imgTag = (src: string) => (src ? `<img src="${src}" />` : '');
  // Nombres seuls dans les attributs `style` (calculés, jamais saisis).
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;

  // Titre de couverture : corps et hauteur estimés (`coverTitleLayout`, commun
  // aux deux moteurs) — les photos se rangent sous le titre, quelle que soit
  // sa longueur et ses retours à la ligne. Pas d'année sous le titre : qui la
  // veut l'écrit dans le titre (« Madère, octobre 2026 »).
  let coverHtml: string;
  if (coverStyle === 'scatter') {
    const picks = coverPicks(photoEntries, 'scatter', coverPhotoId, scatterIds);
    const head = coverTitleLayout(
      title,
      options.typeface,
      SCATTER_TITLE.size,
      COVER_W - 2 * SCATTER_TITLE.side,
    );
    const slots = scatterSlots(
      picks.length,
      seedOf(picks.map((p) => p.id)),
      pageH,
      SCATTER_TITLE.top + head.height + 14,
    );
    const polas = picks
      .map((p, i) => {
        const s = slots[i];
        const box = polaroidBox(s.size);
        return `<figure class="pola" style="left:${px(s.cx - box.w / 2)};top:${px(s.cy - box.h / 2)};width:${px(box.w)};height:${px(box.h)};transform:rotate(${s.rot.toFixed(2)}deg);z-index:${s.z}">${imgTag(srcOf(p))}</figure>`;
      })
      .join('');
    coverHtml = `
        <section class="sheet cover-abs">
          <div class="cv-head">
            <h1 class="cover-title" style="font-size:${px(head.size)}">${coverTitle}</h1>
          </div>
          ${polas}
        </section>`;
  } else if (coverStyle === 'filmstrip') {
    const picks = coverPicks(photoEntries, 'filmstrip', coverPhotoId);
    const head = coverTitleLayout(
      title,
      options.typeface,
      GRID.titleSize,
      COVER_W - 2 * SCATTER_TITLE.side,
    );
    const layout = gridLayout(picks.length, pageH, head.height + 12);
    const cells = picks
      .map((p, i) => {
        const c = layout.cells[i];
        return `<div class="cell" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.w)};height:${px(c.h)}">${imgTag(srcOf(p))}</div>`;
      })
      .join('');
    coverHtml = `
        <section class="sheet cover-abs">
          ${cells}
          <div class="cv-head grid-head" style="top:${px(layout.titleY)}">
            <h1 class="cover-title" style="font-size:${px(head.size)}">${coverTitle}</h1>
          </div>
        </section>`;
  } else {
    // Couverture classique : titre réduit au-delà de deux lignes ; la photo
    // cède le reste de la place en CSS (cf. `.cover`).
    const head = coverTitleLayout(title, options.typeface, 58, COVER_W - 92);
    coverHtml = `
        <section class="sheet cover">
          <span class="crop tl"></span><span class="crop tr"></span>
          <span class="crop bl"></span><span class="crop br"></span>
          <h1 class="cover-title" style="font-size:${px(head.size)}">${coverTitle}</h1>
          <div class="cover-hero">${imgTag(coverSrc)}</div>
          <div class="cover-foot">
            <span>${escapeHtml(subtitle)}</span>
            <span class="reg"></span>
          </div>
        </section>`;
  }

  // Carte des lieux juste après la couverture (rien si aucune photo n'a de GPS).
  // Avec les cartes de photos, la page ne reprend que les lieux qui en ont une :
  // décocher une photo prise ailleurs l'en retire aussi.
  const mapModel = options.showMap
    ? buildMapModel(
        mapIds.size ? photosOfMappedPlaces(photos, mapIds) : photos,
        options.typeface,
        options.background,
        lang,
        pageH,
      )
    : null;
  const mapHtml = mapModel ? mapPageHtml(mapModel, pageH) : '';

  const ctx: PageCtx = {
    dateFormat: options.dateFormat,
    showPlace: options.showPlace,
    frame: options.frame,
    lang,
    interactive,
  };
  const pages = paginateEntries(pageSource, options.photoSize, {
    wide: mapIds,
    commentScale: COMMENT_SCALE[options.commentSize],
    perPhotoSize: true,
  })
    .map((page, index) => {
      const no = index + 1;
      if (page.type === 'text') return textPageHtml(page.item, no, ctx);
      const groupItems = page.items.map(
        (p) => items.find((it) => it.photo.id === p.id)!,
      );
      if (page.size === 'full') return fullPageHtml(groupItems[0], ctx);
      return pageHtml(groupItems, page.size, page.solo, no, ctx);
    })
    .join('');

  return `<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        ${CSP_META}
        <!-- width = largeur de page A4 en points : l'aperçu WebView met la page
             à l'échelle de l'écran ; ignoré par expo-print (dimensions fournies).
             En aperçu, la largeur ajoute les marges du plan de travail. -->
        <meta name="viewport" content="width=${interactive ? PAGE_WIDTH + 2 * DESK_GAP : PAGE_WIDTH}, initial-scale=1" />
        <style>${buildStyles(options)}${interactive ? deskCss(pageH) : printScale(format)}</style>
      </head>
      <body class="${[interactive ? 'desk' : '', isSquare(format) ? 'fmt-square' : ''].filter(Boolean).join(' ')}">
        ${coverHtml}
        ${mapHtml}
        ${pages}
        <section class="sheet end">
          <p class="orn">✦</p>
          <p>${escapeHtml(subtitle)}</p>
          <p class="credit">${creditHtml()}</p>
        </section>
      </body>
    </html>`;
}

/**
 * PDF d'un format plus petit que l'A4 : la page mise en page sur 595 unités de
 * large est réduite à sa largeur réelle (16 cm = 453,5 pt). Rien en A4. Jamais
 * dans l'aperçu, qui montre les pages à l'échelle de l'écran.
 */
function printScale(format: PageFormat): string {
  const { zoom, print } = PAGE_FORMATS[format];
  if (zoom === 1) return '';
  return `
  @page { size: ${print.width.toFixed(2)}pt ${print.height.toFixed(2)}pt; margin: 0; }
  html { zoom: ${zoom.toFixed(5)}; }`;
}

/**
 * Mention de l'app suivie du monogramme « CC » (SVG en ligne, à la hauteur de
 * `LOGO_MARK_SCALE` fois le corps du texte, centré sur sa ligne).
 */
function creditHtml(): string {
  const logo = LOGO_MARK_SVG.replace('<svg ', '<svg class="credit-logo" aria-hidden="true" ');
  return `${escapeHtml(ALBUM_CREDIT)}${logo}`;
}

const CREDIT_LOGO_CSS = `
  .credit { display: flex; align-items: center; justify-content: center; gap: 0.35em; }
  .credit-logo { width: ${LOGO_MARK_SCALE}em; height: ${LOGO_MARK_SCALE}em; flex: 0 0 auto; }`;

/** Compteur des découpes SVG : plusieurs cartes cohabitent dans le même document. */
let svgClipSeq = 0;

/**
 * Éléments d'un modèle de carte (`albumMap.ts`) en SVG : `defs` (découpes) et
 * corps. Simple transcription — tout le placement est calculé dans le modèle,
 * à l'identique pour le rendu Skia (`drawMapItems`).
 */
function mapSvgParts(items: MapItem[]): { defs: string; body: string } {
  const clips = new Map<string, string>();
  const clipId = (r: MapRect) => {
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    let id = clips.get(key);
    if (!id) {
      id = `mc${svgClipSeq++}`;
      clips.set(key, id);
    }
    return id;
  };
  const body = items
    .map((it) => {
      if (it.kind === 'shape') {
        const attrs = [
          `d="${it.d}"`,
          `fill="${it.fill ?? 'none'}"`,
          it.stroke ? `stroke="${it.stroke}" stroke-width="${it.width ?? 1}"` : '',
          it.dash ? `stroke-dasharray="${it.dash.join(' ')}"` : '',
          it.opacity !== undefined ? `opacity="${it.opacity}"` : '',
          it.offset ? `transform="translate(${it.offset.join(' ')})"` : '',
        ].join(' ');
        const path = `<path ${attrs}/>`;
        // Découpe posée sur un groupe : elle ne subit pas le décalage du tracé.
        return it.clip ? `<g clip-path="url(#${clipId(it.clip)})">${path}</g>` : path;
      }
      const face = FACES[it.fam];
      const weight = it.bold ? face.bold[0] : face.regular[0];
      const spacing = it.spacing ? ` letter-spacing="${it.spacing}"` : '';
      return `<text x="${it.x}" y="${it.y}" text-anchor="${it.anchor}" font-size="${it.size}" font-weight="${weight}" fill="${it.color}"${spacing} style="font-family:${FAM_CSS[it.fam]}">${escapeHtml(it.text.replace(/\s+/g, ' '))}</text>`;
    })
    .join('');
  const defs = [...clips]
    .map(([key, id]) => {
      const [x, y, w, h] = key.split(',');
      return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
    })
    .join('');
  return { defs, body };
}

/** Page « Nos lieux de visite » : un SVG pleine page. */
function mapPageHtml(model: MapModel, pageH: number): string {
  const { defs, body } = mapSvgParts(model.items);
  return `
        <section class="sheet mappage">
          <svg width="${PAGE_WIDTH}" height="${pageH}" viewBox="0 0 ${PAGE_WIDTH} ${pageH}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>
        </section>`;
}

/** Repère de la carte d'une photo : pointe au centre de la carte (cf. `.mpin`). */
const MINI_PIN_SVG = (() => {
  const { body } = mapSvgParts(miniPinItems(0, 0));
  return `<svg class="mpin" viewBox="-12 -30 24 32" width="24" height="32" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
})();

/**
 * Contenu de la carte d'une photo : l'image Apple Plans (base64) ou, à défaut,
 * la carte stylisée hors ligne — cadrées « cover » toutes deux — et le repère.
 */
function miniMapHtml(photo: Photo, b64: string | null): string {
  const c = photoCoords(photo);
  if (!c) return '';
  let art: string;
  if (b64) {
    art = `<img class="mapimg" src="data:image/jpeg;base64,${b64}" />`;
  } else {
    const { defs, body } = mapSvgParts(buildMiniMapModel(c.lat, c.lon).items);
    art = `<svg class="mm" viewBox="0 0 ${MINI_W} ${MINI_H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;
  }
  return `${art}${MINI_PIN_SVG}`;
}

/** Une ligne factuelle « Clé : valeur » du rapport professionnel. */
function proMeta(label: string, value: string, cls = '', rich = false): string {
  const body = rich ? richToHtml(value, escapeHtml) : escapeHtml(value);
  return `<div class="row ${cls}"><dt>${label}</dt><dd>${body}</dd></div>`;
}

/** Corps du texte d'un rapport pro, rapporté au corps normal (`proTextSize`). */
function proScale(options: ExportOptions): number {
  return PRO_TEXT_SCALE[options.proTextSize ?? 'normal'];
}

/** Lignes fixes d'une fiche pro (lieu, date) selon les réglages. */
function proRows(options: ExportOptions): number {
  return (options.showPlace ? 1 : 0) + (options.dateFormat === 'none' ? 0 : 1);
}

function proEntryHtml(
  item: Item,
  number: number,
  dateFormat: ExportOptions['dateFormat'],
  showPlace: boolean,
  lang: Lang,
  interactive = false,
): string {
  const { photo, src } = item;
  const D = dict(lang).doc;
  // « Aucune » retire la ligne de date entière, pas seulement sa valeur.
  const date =
    dateFormat === 'none'
      ? ''
      : formatPhotoDate(photoDate(photo), dateFormat, lang) || '—';
  // Comme la date, « Lieu » disparaît en entier quand l'option est décochée.
  const place = showPlace ? photo.place?.trim() || '—' : '';
  const desc = photo.comment.trim() || '—';
  const img = src
    ? `<img src="${src}" />`
    : `<span class="missing">${D.imageUnavailable}</span>`;
  const body = `
      <div class="num">${D.photoNo(number)}</div>
      <div class="frame">${img}</div>
      <dl class="meta">
        ${place ? proMeta(D.place, place) : ''}
        ${date ? proMeta(D.date, date, 'date') : ''}
        ${proMeta(D.description, desc, '', true)}
      </dl>`;
  return `
    <article class="entry sz-${photo.proSize ?? 'medium'}" id="e-${escapeHtml(photo.id)}">
      ${interactive ? `<a class="edit" href="${editHref(photo.id)}">${body}</a>` : body}
    </article>`;
}

/**
 * Page de texte seule du rapport : sa propre page, texte en haut par défaut
 * (présentation « document »), au milieu ou en bas selon `textVAlign`.
 */
function proTextPageHtml(item: Photo, pageNo: number, interactive: boolean, last: string): string {
  const text = escapeHtml(item.comment.trim()).replace(/\n/g, '<br/>');
  const body = `<div class="pro-text-body">${text}</div>`;
  return `
    <section class="sheet pro-text tv-${item.textVAlign ?? 'top'}" id="e-${escapeHtml(item.id)}">
      ${interactive ? `<a class="edit" href="${editHref(item.id)}">${body}</a>` : body}
      ${last}
      <p class="footer">${pageNo}</p>
    </section>`;
}

/**
 * Rapport photographique sobre (fond blanc, factuel), en **pages explicites**
 * (`paginateProEntries`) : les mêmes que les images du rapport. Chaque page ne
 * reçoit que les fiches qui y tiennent (hauteur estimée) ; si une estimation
 * se trompe, la feuille s'allonge (`min-height`) plutôt que de tronquer une
 * description — essentiel pour une expertise. En aperçu, les pages sont posées
 * en feuilles sur un plan de travail, comme l'album Loisir.
 */
function buildProDocument(
  items: Item[],
  title: string,
  options: ExportOptions,
  lang: Lang,
  /** Aperçu : fiches et pages de texte cliquables (taille, position du texte). */
  interactive = false,
): string {
  const { textAlign, dateAlign, dateFormat, showPlace } = options;
  const scale = proScale(options);
  const pages = paginateProEntries(
    items.map((it) => it.photo),
    scale,
    proRows(options),
  );
  const byId = new Map(items.map((it) => [it.photo.id, it]));
  const credit = `<p class="credit">${creditHtml()}</p>`;
  // Les photos sont numérotées dans l'ordre ; la mention de l'app se pose en
  // pied de la dernière page.
  let photoNo = 0;
  const sheets = pages
    .map((page, i) => {
      const no = i + 1;
      const last = i === pages.length - 1 ? credit : '';
      if (page.type === 'text') return proTextPageHtml(page.item, no, interactive, last);
      const entries = page.items
        .map((p) => proEntryHtml(byId.get(p.id)!, ++photoNo, dateFormat, showPlace, lang, interactive))
        .join('');
      return `
    <section class="sheet pro-page sz-${page.size}">
      ${entries}
      ${last}
      <p class="footer">${no}</p>
    </section>`;
    })
    .join('');
  const today = new Date().toLocaleDateString(localeTag(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Encadrement des photos : seule la caisse change, la hauteur de la vignette
  // ne dépend que de la taille (et du corps du texte).
  const frameCss = {
    card: 'background: #f8f9fa; border: 0; border-radius: 6px;',
    border: 'background: #f8f9fa; border: 1px solid #d7dbe0; border-radius: 4px;',
    polaroid:
      'background: #ffffff; border: 1px solid #e5e7eb; border-radius: 2px; padding: 14px 14px 20px;',
    none: 'background: transparent; border: 0; border-radius: 0;',
  }[options.frame];
  const L = PRO_LAYOUT;
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  // Intitulés gris : ils grandissent moitié moins que les valeurs.
  const labelScale = 1 + (scale - 1) / 2;

  const styles = `
    ${MONTSERRAT_FACE}
    /* Pas d'agrandissement automatique des petits textes par iOS : sans cela,
       Normale et Grande s'affichaient pareil dans l'aperçu. */
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact; }
    body { margin: 0; background: #ffffff; color: #14181f;
      font-family: 'Montserrat', Georgia, serif; font-size: 12px; }
    @page { size: ${PAGE_WIDTH}pt ${L.pageH}pt; margin: 0; }
    /* Feuille A4 : hauteur minimale d'une page, saut après chacune. */
    .sheet { position: relative; min-height: ${L.pageH}px; background: #ffffff;
      page-break-after: always; }
    .sheet:last-of-type { page-break-after: auto; }
    .cover { padding: 96px 56px 0; }
    .cover .kicker { font-size: 12px; letter-spacing: 5px; color: #6b7280; font-weight: 700; }
    .cover h1 { font-size: 34px; font-weight: 700; margin: 10px 0 18px; color: #111827; }
    .cover .rule { height: 2px; background: #111827; width: 64px; margin-bottom: 26px; }
    .cover .row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #eef0f3; }
    .cover dt { width: 150px; color: #6b7280; margin: 0; }
    .cover dd { margin: 0; font-weight: 600; }
    /* Page de fiches : depuis le haut. Les petites se posent deux par ligne
       (inline-block) ; lignes centrées, pour qu'une petite seule ne reste pas
       calée à gauche. */
    .pro-page { padding: ${L.padTop}px 46px ${L.padBottom}px; font-size: 0; text-align: center; }
    .entry { margin: 0 10px ${L.entryGap}px; font-size: ${px(12 * scale)}; text-align: left; }
    .entry.sz-small { display: inline-block; vertical-align: top; width: calc(50% - 20.5px); }
    a.edit { display: block; color: inherit; text-decoration: none; }
    .num { font-size: ${px(13 * scale)}; font-weight: 700; color: #111827; margin-bottom: 8px;
      letter-spacing: 0.5px; }
    .frame { overflow: hidden;
      display: flex; align-items: center; justify-content: center; ${frameCss} }
    .sz-small .frame { height: ${proFrameH('small', scale)}px; }
    .sz-medium .frame { height: ${proFrameH('medium', scale)}px; }
    .sz-large .frame { height: ${proFrameH('large', scale)}px; }
    .frame img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .missing { color: #9ca3af; font-style: italic; }
    .meta { margin: ${L.metaTop}px 0 0; }
    .meta .row { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #f1f2f4; }
    .meta dt { width: ${px(96 * labelScale)}; flex-shrink: 0; color: #6b7280; margin: 0;
      text-transform: uppercase; font-size: ${px(10 * labelScale)}; letter-spacing: 1px;
      padding-top: 2px; }
    .sz-small .meta dt { width: ${px(PRO_SMALL_DT * labelScale)}; }
    .meta dd { margin: 0; color: #14181f; line-height: 1.5;
      font-weight: ${options.proTextBold ? 800 : 500}; }
    /* La valeur de date occupe toute la largeur restante pour que son
       alignement (gauche / centre / droite) soit visible. */
    .meta .row.date dd { flex: 1; text-align: ${dateAlign}; }
    /* Page de texte : position verticale choisie dans l'aperçu (haut par défaut). */
    .pro-text { padding: 64px 56px ${L.padBottom}px; display: flex; flex-direction: column; }
    .pro-text.tv-top { justify-content: flex-start; }
    .pro-text.tv-middle { justify-content: center; }
    .pro-text.tv-bottom { justify-content: flex-end; }
    .pro-text-body { text-align: ${textAlign}; white-space: pre-wrap;
      font-size: ${px(20 * scale)}; line-height: 1.7; color: #14181f;
      font-weight: ${options.proTextBold ? 800 : 500}; }
    .footer { position: absolute; left: 0; right: 0; bottom: 22px; margin: 0;
      text-align: center; font-size: 10px; letter-spacing: 2px; color: #9ca3af; }
    /* Mention de l'app en pied de la dernière page, au-dessus du numéro. */
    .credit { position: absolute; left: 0; right: 0; bottom: 44px; margin: 0;
      font-size: 12px; letter-spacing: 0.6px; color: #6b7280; }
    ${CREDIT_LOGO_CSS}
    ${
      interactive
        ? `
    body.desk { background: #cdc7bc; padding: ${DESK_GAP}px ${DESK_GAP}px 2px; }
    body.desk .sheet { width: ${PAGE_WIDTH}px; margin: 0 0 ${DESK_GAP + 4}px;
      box-shadow: 0 0 0 1px rgba(31,29,26,0.12), 0 3px 12px rgba(31,29,26,0.28); }`
        : ''
    }`;

  const D = dict(lang).doc;
  return `<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        ${CSP_META}
        <meta name="viewport" content="width=${interactive ? PAGE_WIDTH + 2 * DESK_GAP : PAGE_WIDTH}, initial-scale=1" />
        <style>${styles}</style>
      </head>
      <body${interactive ? ' class="desk"' : ''}>
        <section class="sheet cover">
          <h1>${escapeHtml(title)}</h1>
          <div class="rule"></div>
          <dl>
            ${proMeta(D.establishedOn, today)}
            ${proMeta(D.photoCountLabel, String(items.filter((it) => it.photo.kind !== 'text').length))}
          </dl>
        </section>
        ${sheets}
      </body>
    </html>`;
}

/** Base de nom de fichier « Titre JJ-MM-AAAA » (sans caractères interdits). */
export function albumFileBase(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safe || 'Album'} ${fileDateStamp()}`;
}

/**
 * Rend le HTML en PDF puis copie le fichier vers un nom lisible
 * (« Nom de l'album JJ-MM-AAAA.pdf ») pour qu'il soit identifiable au partage.
 * @returns l'URI du PDF nommé.
 */
export async function htmlToPdfFile(
  html: string,
  title: string,
  /** Format des pages (A4 par défaut ; cf. `effectiveFormat`). */
  format: PageFormat = 'a4',
): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html,
    ...PAGE_FORMATS[format].print,
  });
  const dest = `${FileSystem.cacheDirectory}${albumFileBase(title)}.pdf`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && typeof info.size === 'number') {
      const mo = info.size / (1024 * 1024);
      if (mo > 10) {
        console.warn(`[pdf] PDF volumineux : ${mo.toFixed(1)} Mo (> 10 Mo)`);
      }
    }
    return dest;
  } catch {
    // En cas d'échec de renommage, on partage au moins le PDF d'origine.
    return uri;
  }
}

/** Ouvre la feuille de partage iOS pour un fichier généré. */
export async function shareFile(
  uri: string,
  title: string,
  mimeType: string,
  UTI: string,
): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: `Envoyer « ${title} »`,
      UTI,
    });
  }
}

import type { CommentSize, CoverStyle, FrameStyle, Photo, Typeface } from './types';

/*
 * Typographie et couvertures du rendu familial — source unique partagée par les
 * DEUX moteurs (`pdf.ts` en HTML, `pageImages.ts` en Skia). Les gabarits de
 * couverture sont calculés ici en points A4 (595 × 842) : le PDF les pose en
 * `position: absolute`, Skia les multiplie par son échelle. Toute retouche de
 * placement se fait donc à un seul endroit, sans risque de faire diverger
 * l'aperçu PDF du rendu JPEG.
 */

/** Famille de police d'un rôle de texte. */
export type FontFam = 'sans' | 'serif' | 'script';

export interface TypeSpec {
  /** Titre et année de couverture. */
  title: FontFam;
  /** Commentaire sous la photo (et légende de pleine page). */
  caption: FontFam;
  /** Pages de texte : texte long, jamais en manuscrite. */
  text: FontFam;
  /** Ligne lieu · date sous la photo. */
  meta: FontFam;
  /**
   * Corps relatif de la légende. Caveat a un œil bien plus petit que
   * Montserrat : à corps égal, une légende manuscrite paraissait minuscule.
   */
  captionScale: number;
  titleScale: number;
  /** Interlignage CSS de la légende (« aérée » pour sérif et manuscrite). */
  lineHeight: number;
  /** Titre de couverture en capitales : propre au Montserrat (une manuscrite en capitales est illisible). */
  uppercaseTitle: boolean;
  /** Légende en graisse forte : Caveat en graisse normale est trop pâle pour être lue. */
  captionBold: boolean;
}

export const TYPE_SPECS: Record<Typeface, TypeSpec> = {
  sans: {
    title: 'sans',
    caption: 'sans',
    text: 'sans',
    meta: 'sans',
    captionScale: 1,
    titleScale: 1,
    lineHeight: 1.45,
    uppercaseTitle: true,
    captionBold: false,
  },
  serif: {
    title: 'serif',
    caption: 'serif',
    text: 'serif',
    meta: 'serif',
    captionScale: 1,
    titleScale: 1,
    lineHeight: 1.55,
    uppercaseTitle: false,
    captionBold: false,
  },
  script: {
    title: 'script',
    caption: 'script',
    text: 'serif',
    meta: 'serif',
    captionScale: 1.3,
    titleScale: 1.25,
    lineHeight: 1.4,
    uppercaseTitle: false,
    captionBold: true,
  },
};

/*
 * Lisibilité des commentaires — partagée par les deux moteurs. Retour testeurs :
 * légendes « trop petites et trop pâles ». Corps de base en points A4 (petite
 * taille / autres), multiplié par `captionScale` (police) puis par
 * `COMMENT_SCALE` (réglage) ; Skia multiplie encore par `W / COVER_W`.
 */
export const COMMENT_BASE = { small: 16, other: 18 };
/**
 * Corps du texte du rapport professionnel (`proTextSize`). Paliers plus francs
 * que `COMMENT_SCALE` : le texte de base y est petit (12 pt), +20 % ne se
 * voyait guère.
 */
export const PRO_TEXT_SCALE: Record<CommentSize, number> = {
  normal: 1,
  large: 1.25,
  xlarge: 1.5,
};

export const COMMENT_SCALE: Record<CommentSize, number> = {
  normal: 1,
  large: 1.2,
  xlarge: 1.4,
};
/** Commentaire sur cadre blanc (ou fond clair) : encre quasi noire. */
export const CAPTION_INK = '#14120f';
/** Ligne « lieu · date » : 8,5 pt, foncée (c'était 6,5 pt beige, illisible). */
export const META_SIZE = 8.5;
export const META_INK = '#4d473e';
export const META_INK_DARK = '#e0dbd0';

/**
 * Gris des petits textes (pied de page, numéros, sous-titres) selon le fond.
 * Le gris d'origine se perdait sur les fonds naturels (kraft, taupe, sauge) :
 * en dessous de 215 de luminance, un gris plus foncé. Les fonds clairs gardent
 * exactement l'ancien gris.
 */
export function mutedInk(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#a89f8d';
  const n = parseInt(m[1], 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  if (luma < 128) return '#8f8a80';
  return luma < 215 ? '#6b6253' : '#a89f8d';
}

/**
 * Hauteur prise à la photo pour loger un commentaire plus grand que le corps
 * normal (deux lignes de plus de hauteur) : la carte garde sa hauteur, la
 * pagination ne bouge pas (même principe que les bandes de `pdf.ts`).
 */
export function commentShrink(baseSize: number, t: Typeface, size: CommentSize): number {
  const spec = TYPE_SPECS[t];
  return Math.round(2 * baseSize * spec.captionScale * (COMMENT_SCALE[size] - 1) * spec.lineHeight);
}

/**
 * Arrondi des coins d'une photo et de sa carte selon l'encadrement (points A4),
 * commun aux deux moteurs. Avec le liseré, photo et carte prennent le coin
 * presque droit du tirage (`LISERET`).
 */
export const PHOTO_RADIUS: Record<FrameStyle, number> = {
  card: 10,
  border: 8,
  polaroid: 0,
  none: 14,
};

/**
 * Mention de l'app en bas de la page de fin, dans le corps et la police des
 * dates sous les photos (`META_SIZE`, famille `meta`) : discrète, mais présente
 * dans chaque album envoyé. Marque, donc non traduite.
 */
export const ALBUM_CREDIT = 'Powered by ComClic';

/**
 * Monogramme « CC » de ComClic posé après `ALBUM_CREDIT` : même dessin que
 * `design/logo-mark.svg` (cercles de visée + deux C en dégradé), sans fond.
 * Vectoriel, donc net à toute taille : SVG en ligne dans le PDF, `drawSvg`
 * côté Skia. Le dégradé porte un identifiant unique au document.
 */
export const LOGO_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">' +
  '<defs><linearGradient id="ccmark" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#C4602C"/><stop offset="1" stop-color="#8E3F1B"/>' +
  '</linearGradient></defs>' +
  '<g transform="translate(512,512) scale(1.12) translate(-512,-512)">' +
  '<g stroke="#B9764F" fill="none" opacity="0.75">' +
  '<circle cx="512" cy="512" r="392" stroke-width="20"/>' +
  '<circle cx="512" cy="512" r="300" stroke-width="14"/></g>' +
  '<g fill="none" stroke="url(#ccmark)" stroke-width="84" stroke-linecap="round">' +
  '<path d="M445 385 A 166 166 0 1 0 445 639"/>' +
  '<path d="M793 385 A 166 166 0 1 0 793 639"/></g></g></svg>';

/** Taille du monogramme rapportée au corps de la mention. */
export const LOGO_MARK_SCALE = 1.9;

/** Liseré blanc posé sur la photo et sur sa carte (points A4). */
export const LISERET = { width: 6, radius: 2 };

/**
 * Année affichée sous le titre de couverture, ou rien quand le titre la donne
 * déjà (« Instructions du 21 10 2026 » suivi de « 2026 » faisait doublon). Une
 * plage (« 2025 – 2026 ») disparaît si le titre contient toutes ses années.
 */
export function coverYearText(title: string, yearLabel: string): string {
  const years = yearLabel.match(/\d{4}/g) ?? [];
  if (!years.length) return yearLabel;
  return years.every((y) => title.includes(y)) ? '' : yearLabel;
}

/** Familles réellement employées (le PDF n'embarque que celles-là). */
export function famsUsed(t: Typeface): FontFam[] {
  const s = TYPE_SPECS[t];
  return [...new Set<FontFam>([s.title, s.caption, s.text, s.meta])];
}

/* --------------------------------------------------------------------------
 * Largeur des textes (estimation commune aux deux moteurs)
 * ------------------------------------------------------------------------ */

/** Largeur moyenne d'un caractère (en em), normale et grasse, par famille. */
export const CHAR_EM: Record<FontFam, [number, number]> = {
  sans: [0.58, 0.64],
  serif: [0.52, 0.56],
  script: [0.42, 0.44],
};

/** Largeur estimée d'un texte (points) : identique pour le PDF et Skia. */
export function estimateTextWidth(text: string, size: number, bold: boolean, fam: FontFam): number {
  return text.length * size * CHAR_EM[fam][bold ? 1 : 0];
}

/**
 * Nombre de lignes estimé d'un texte : retours à la ligne voulus (`\n`), puis
 * coupures automatiques dans `width` (marge de 8 % pour les coupures de mots).
 */
export function estimateLines(
  text: string,
  size: number,
  fam: FontFam,
  bold: boolean,
  width: number,
): number {
  return text
    .split('\n')
    .reduce(
      (n, para) =>
        n + Math.max(1, Math.ceil((estimateTextWidth(para.trim(), size, bold, fam) * 1.08) / width)),
      0,
    );
}

/** Interligne le plus haut des deux moteurs (Skia 1,32 ; PDF 1,04) : estimation sûre. */
const TITLE_LINE = 1.32;

export interface CoverTitleLayout {
  /** Corps du titre (points), réduit s'il faudrait plus de deux lignes. */
  size: number;
  lines: number;
  /** Hauteur du bloc titre + année (points). */
  height: number;
}

/**
 * Titre d'une couverture : corps et hauteur du bloc. Un titre de plus de deux
 * lignes (retours voulus ou coupures) perd jusqu'à 28 % de corps avant de
 * prendre une ligne de plus — les photos gardent ainsi leur place. Sert aux
 * deux moteurs : la mise en page des photos part du bas de ce bloc.
 */
export function coverTitleLayout(
  title: string,
  typeface: Typeface,
  baseSize: number,
  width: number,
  withYear: boolean,
): CoverTitleLayout {
  const spec = TYPE_SPECS[typeface];
  const text = spec.uppercaseTitle ? title.toUpperCase() : title;
  const full = baseSize * spec.titleScale;
  let size = full;
  let lines = estimateLines(text, size, spec.title, true, width);
  while (lines > 2 && size > full * 0.72) {
    size = Math.round(size * 0.92 * 10) / 10;
    lines = estimateLines(text, size, spec.title, true, width);
  }
  const yearH = withYear ? 8 + 24 * spec.titleScale * TITLE_LINE : 0;
  return { size, lines, height: lines * size * TITLE_LINE + yearH };
}

/* --------------------------------------------------------------------------
 * Couvertures
 * ------------------------------------------------------------------------ */

/**
 * Dimensions de la page A4 en points (= px CSS du PDF) : largeur commune à tous
 * les formats, hauteur de l'A4 (cf. `pageFormat.ts` pour les autres).
 */
export const COVER_W = 595;
export const COVER_H = 842;

/** Nombre minimal de photos pour qu'un montage ait de l'allure. */
const COVER_MIN: Record<CoverStyle, number> = { classic: 1, scatter: 3, filmstrip: 4 };
const COVER_MAX: Record<CoverStyle, number> = { classic: 1, scatter: 9, filmstrip: 9 };

/**
 * Style de couverture réellement rendu : un montage sans assez de photos
 * retombe sur la couverture classique plutôt que d'afficher une grille à trous.
 */
export function effectiveCover(style: CoverStyle, photoCount: number): CoverStyle {
  return photoCount >= COVER_MIN[style] ? style : 'classic';
}

/**
 * Choix du pêle-mêle réellement utilisable : identifiants encore présents dans
 * le dossier (une photo supprimée depuis disparaît), sans page de texte, dans
 * l'ordre choisi, plafonnés à 9. Moins de 3 → `[]`, c'est-à-dire « automatique ».
 */
export function validScatterPicks(photos: Photo[], ids: string[] | undefined): Photo[] {
  if (!ids?.length) return [];
  const byId = new Map(photos.filter((p) => p.kind !== 'text').map((p) => [p.id, p]));
  const picked = [...new Set(ids)]
    .map((id) => byId.get(id))
    .filter((p): p is Photo => !!p)
    .slice(0, SCATTER_MAX);
  return picked.length >= SCATTER_MIN ? picked : [];
}

/**
 * Photos d'un montage de couverture. Pêle-mêle : la sélection de
 * l'utilisateur si elle est valable (la 1ʳᵉ choisie au centre). Sinon, et pour
 * la grille : la photo étoilée ★ d'abord, puis les suivantes dans l'ordre du
 * dossier. Les pages de texte sont exclues.
 */
export function coverPicks(
  photos: Photo[],
  style: CoverStyle,
  coverPhotoId?: string,
  scatterIds?: string[],
): Photo[] {
  if (style === 'scatter') {
    const chosen = validScatterPicks(photos, scatterIds);
    if (chosen.length) return chosen;
  }
  const entries = photos.filter((p) => p.kind !== 'text');
  const star = entries.find((p) => p.id === coverPhotoId);
  const ordered = star ? [star, ...entries.filter((p) => p !== star)] : entries;
  if (style === 'filmstrip') return ordered.slice(0, gridShape(ordered.length).count);
  return ordered.slice(0, style === 'scatter' ? SCATTER_AUTO : COVER_MAX[style]);
}

/** Cadre polaroïd : marge blanche autour de la photo, plus large en bas. */
export const POLAROID = { pad: 8, bottom: 28 };

export interface PolaroidSlot {
  /** Centre du cadre (points A4). */
  cx: number;
  cy: number;
  /** Côté de la photo carrée, hors cadre. */
  size: number;
  /** Inclinaison en degrés. */
  rot: number;
  /** Ordre d'empilement : la photo étoilée passe au-dessus des autres. */
  z: number;
}

/** Dimensions extérieures d'un polaroïd (photo + cadre). */
export function polaroidBox(size: number): { w: number; h: number } {
  return { w: size + 2 * POLAROID.pad, h: size + POLAROID.pad + POLAROID.bottom };
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32). Le « désordre » du
 * pêle-mêle doit être identique dans le PDF et le JPEG, et d'un export à
 * l'autre : il est donc tiré d'une graine, jamais de `Math.random`.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine stable tirée des identifiants des photos (FNV-1a). */
export function seedOf(ids: string[]): number {
  let h = 0x811c9dc5;
  for (const ch of ids.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Nombre de photos du pêle-mêle : bornes du choix de l'utilisateur. */
export const SCATTER_MIN = 3;
export const SCATTER_MAX = 9;
/** Nombre retenu quand l'utilisateur n'a rien choisi. */
const SCATTER_AUTO = 7;

/**
 * Gabarits du pêle-mêle, un par nombre de photos : `[cx, cy, côté]` en points
 * A4. La première entrée est la photo principale (au centre, au-dessus des
 * autres). Placés à la main pour **remplir** la zone sous le titre
 * (≈ y 190 → 825, x 20 → 575) sans sortir de la feuille malgré l'inclinaison :
 * moins il y a de photos, plus elles sont grandes. Une taille unique laissait
 * la page à moitié vide dès 7 photos.
 */
const SCATTER_LAYOUTS: Record<number, [number, number, number][]> = {
  3: [[300, 680, 250], [175, 385, 228], [420, 415, 228]],
  4: [[420, 680, 220], [170, 370, 212], [425, 355, 212], [175, 695, 212]],
  5: [[297, 510, 200], [155, 335, 185], [440, 330, 185], [160, 690, 185], [435, 695, 185]],
  6: [[297, 505, 190], [140, 320, 170], [297, 300, 170], [455, 320, 170], [175, 690, 170], [420, 695, 170]],
  7: [[297, 515, 185], [165, 315, 165], [430, 305, 165], [118, 515, 165], [477, 520, 165], [175, 715, 165], [425, 710, 165]],
  8: [[297, 510, 180], [130, 310, 155], [297, 300, 155], [465, 310, 155], [110, 510, 155], [485, 510, 155], [185, 715, 155], [410, 715, 155]],
  9: [[297, 512, 175], [130, 315, 150], [297, 300, 150], [465, 315, 150], [108, 512, 150], [487, 512, 150], [130, 712, 150], [297, 725, 150], [465, 712, 150]],
};

/** Gabarit du pêle-mêle : l'indice 0 est la photo principale (au centre, au-dessus). */
export function scatterSlots(
  count: number,
  seed: number,
  pageH: number = COVER_H,
  /** Bas du bloc titre (points) : les photos se rangent en dessous. */
  zoneTop = 0,
): PolaroidSlot[] {
  const rand = rng(seed);
  const jitter = (n: number) => (rand() * 2 - 1) * n;
  const n = Math.min(SCATTER_MAX, Math.max(SCATTER_MIN, count));
  // Recalage commun des gabarits : remontés vers le titre et légèrement
  // agrandis — une bande vide de ~100 pt séparait le titre des photos.
  const raw = SCATTER_LAYOUTS[n].map(
    ([cx, cy, size]): [number, number, number] => [cx, cy - 18, size * 1.06],
  );
  // Emprise du montage : cadres polaroïd compris, marge d'inclinaison (×1,08).
  const extent = (f: (r: [number, number, number]) => number, pick: (...v: number[]) => number) =>
    pick(...raw.map(f));
  const box = {
    top: extent(([, cy, z]) => cy - (z / 2 + POLAROID.pad) * 1.08, Math.min),
    bottom: extent(([, cy, z]) => cy + (z / 2 + POLAROID.bottom) * 1.08, Math.max),
    left: extent(([cx, , z]) => cx - (z / 2 + POLAROID.pad) * 1.08, Math.min),
    right: extent(([cx, , z]) => cx + (z / 2 + POLAROID.pad) * 1.08, Math.max),
  };
  // Zone libre : sous le titre, jusqu'au bas de la page.
  const zone = { top: Math.max(zoneTop, 0), bottom: pageH - 6, left: 12, right: COVER_W - 12 };
  const mid = COVER_W / 2;
  // A4 avec un titre qui laisse la place : le gabarit d'origine, inchangé.
  // Sinon (titre long, page plus courte) : le montage se réduit juste ce qu'il
  // faut pour tenir sous le titre, et se centre dans la place libre. En largeur
  // on réduit moins (la page ne manque pas de largeur) : les photos s'écartent.
  const fits = pageH >= COVER_H && box.top >= zone.top && box.bottom <= zone.bottom;
  let s = 1;
  let sx = 1;
  let dy = 0;
  if (!fits) {
    const boxH = box.bottom - box.top;
    const zoneH = zone.bottom - zone.top;
    s = Math.min(1, zoneH / boxH);
    sx = Math.min(1, s * 1.2, (zone.right - zone.left) / (box.right - box.left));
    const top = zone.top + (zoneH - boxH * s) / 2;
    dy = top - box.top * s;
  }
  const [hero, ...others] = raw.map(
    ([cx, cy, size]): [number, number, number] => [
      mid + (cx - mid) * sx,
      cy * s + dy,
      Math.round(size * s),
    ],
  );
  const slots = others.map(([cx, cy, size], i): PolaroidSlot => {
    // Inclinaison franche (3° à 9°), sens alterné : un angle quasi nul
    // ressemblait à une erreur de placement plutôt qu'à un geste.
    const sign = i % 2 === 0 ? -1 : 1;
    return {
      cx: cx + jitter(8),
      cy: cy + jitter(8),
      size,
      rot: sign * (3 + rand() * 6),
      z: i + 1,
    };
  });
  return [
    {
      cx: hero[0] + jitter(5),
      cy: hero[1] + jitter(5),
      size: hero[2],
      rot: jitter(3),
      z: slots.length + 1,
    },
    ...slots,
  ].slice(0, count);
}

/** Bandeau du titre des couvertures montées (pêle-mêle). */
export const SCATTER_TITLE = { top: 52, side: 40, size: 40 };

/** Forme de la grille cinématique selon le nombre de photos disponibles. */
function gridShape(n: number): { cols: number; rows: number; count: number; height: number } {
  if (n >= 9) return { cols: 3, rows: 3, count: 9, height: 560 };
  if (n >= 6) return { cols: 3, rows: 2, count: 6, height: 440 };
  return { cols: 2, rows: 2, count: 4, height: 520 };
}

export interface GridLayout {
  cells: { x: number; y: number; w: number; h: number }[];
  /** Haut du bloc titre, sous la grille. */
  titleY: number;
}

/** Marge de page et joint entre les photos de la grille cinématique. */
export const GRID = { margin: 46, gap: 5, titleSize: 44 };

/** Écart grille → titre, et hauteur estimée du bloc titre + année. */
const GRID_TITLE_GAP = 44;
const GRID_TITLE_BLOCK = 110;

/**
 * Gabarit de la grille cinématique (photos jointives, titre dessous). Le bloc
 * grille + titre est centré verticalement : une grille de 2 rangées calée en
 * haut laissait un tiers de page vide sous le titre.
 */
export function gridLayout(
  count: number,
  pageH: number = COVER_H,
  /** Hauteur du bloc titre + année (`coverTitleLayout`) : jamais moins que d'origine. */
  titleBlock: number = GRID_TITLE_BLOCK,
): GridLayout {
  const shape = gridShape(count);
  const { cols, rows } = shape;
  const block = Math.max(GRID_TITLE_BLOCK, titleBlock);
  // Page moins haute (16 × 21) : la grille perd en hauteur dans la même
  // proportion que la page, les cellules restent proches du même format.
  const s = Math.min(1, pageH / COVER_H);
  // L'écart grille → titre se resserre dans la même proportion (page carrée).
  const titleGap = Math.round(GRID_TITLE_GAP * s);
  // Titre long : la grille cède la hauteur qui manquerait sous elle.
  const room = pageH - 2 * GRID.margin - titleGap - block;
  const height = Math.max(160, Math.min(Math.round(shape.height * s), room));
  const width = COVER_W - 2 * GRID.margin;
  const w = (width - (cols - 1) * GRID.gap) / cols;
  const h = (height - (rows - 1) * GRID.gap) / rows;
  const top = Math.max(
    GRID.margin,
    (pageH - (height + titleGap + block)) / 2,
  );
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: GRID.margin + c * (w + GRID.gap),
        y: top + r * (h + GRID.gap),
        w,
        h,
      });
    }
  }
  return { cells, titleY: top + height + titleGap };
}

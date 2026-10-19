import type { CommentSize, CoverStyle, Photo, Typeface } from './types';

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

/** Familles réellement employées (le PDF n'embarque que celles-là). */
export function famsUsed(t: Typeface): FontFam[] {
  const s = TYPE_SPECS[t];
  return [...new Set<FontFam>([s.title, s.caption, s.text, s.meta])];
}

/* --------------------------------------------------------------------------
 * Couvertures
 * ------------------------------------------------------------------------ */

/** Dimensions de la page A4 en points (= px CSS du PDF). */
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
export function scatterSlots(count: number, seed: number): PolaroidSlot[] {
  const rand = rng(seed);
  const jitter = (n: number) => (rand() * 2 - 1) * n;
  const n = Math.min(SCATTER_MAX, Math.max(SCATTER_MIN, count));
  // Recalage commun des gabarits : remontés vers le titre et légèrement
  // agrandis — une bande vide de ~100 pt séparait le titre des photos.
  const [hero, ...others] = SCATTER_LAYOUTS[n].map(
    ([cx, cy, size]): [number, number, number] => [cx, cy - 18, Math.round(size * 1.06)],
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
export function gridLayout(count: number): GridLayout {
  const { cols, rows, height } = gridShape(count);
  const width = COVER_W - 2 * GRID.margin;
  const w = (width - (cols - 1) * GRID.gap) / cols;
  const h = (height - (rows - 1) * GRID.gap) / rows;
  const top = Math.max(
    GRID.margin,
    (COVER_H - (height + GRID_TITLE_GAP + GRID_TITLE_BLOCK)) / 2,
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
  return { cells, titleY: top + height + GRID_TITLE_GAP };
}

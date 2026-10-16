import type { CoverStyle, Photo, Typeface } from './types';

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
  },
};

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
const COVER_MAX: Record<CoverStyle, number> = { classic: 1, scatter: 7, filmstrip: 9 };

/**
 * Style de couverture réellement rendu : un montage sans assez de photos
 * retombe sur la couverture classique plutôt que d'afficher une grille à trous.
 */
export function effectiveCover(style: CoverStyle, photoCount: number): CoverStyle {
  return photoCount >= COVER_MIN[style] ? style : 'classic';
}

/**
 * Photos d'un montage de couverture : la photo étoilée ★ d'abord, puis les
 * suivantes dans l'ordre du dossier. Les pages de texte sont exclues.
 */
export function coverPicks(
  photos: Photo[],
  style: CoverStyle,
  coverPhotoId?: string,
): Photo[] {
  const entries = photos.filter((p) => p.kind !== 'text');
  const star = entries.find((p) => p.id === coverPhotoId);
  const ordered = star ? [star, ...entries.filter((p) => p !== star)] : entries;
  if (style === 'filmstrip') return ordered.slice(0, gridShape(ordered.length).count);
  return ordered.slice(0, COVER_MAX[style]);
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

/**
 * Emplacements des photos secondaires du pêle-mêle, selon leur nombre. Placés
 * à la main pour laisser libre le bandeau du titre (haut de page) et rester
 * dans la feuille malgré l'inclinaison ; la photo étoilée occupe le centre.
 */
const SCATTER_SPOTS: Record<number, [number, number][]> = {
  2: [[165, 375], [430, 640]],
  3: [[160, 350], [435, 350], [297, 690]],
  4: [[160, 340], [435, 335], [165, 665], [430, 670]],
  5: [[155, 330], [297, 300], [440, 330], [175, 680], [420, 680]],
  6: [[150, 325], [297, 295], [445, 325], [150, 685], [297, 715], [445, 685]],
};
const SCATTER_HERO: [number, number] = [297, 505];

/** Gabarit du pêle-mêle : l'indice 0 est la photo étoilée (au centre, au-dessus). */
export function scatterSlots(count: number, seed: number): PolaroidSlot[] {
  const rand = rng(seed);
  const jitter = (n: number) => (rand() * 2 - 1) * n;
  const spots = SCATTER_SPOTS[count - 1] ?? [];
  const others = spots.map(([cx, cy], i): PolaroidSlot => {
    // Inclinaison franche (3° à 9°), sens alterné : un angle quasi nul
    // ressemblait à une erreur de placement plutôt qu'à un geste.
    const sign = i % 2 === 0 ? -1 : 1;
    return {
      cx: cx + jitter(10),
      cy: cy + jitter(10),
      size: 150,
      rot: sign * (3 + rand() * 6),
      z: i + 1,
    };
  });
  const hero: PolaroidSlot = {
    cx: SCATTER_HERO[0] + jitter(6),
    cy: SCATTER_HERO[1] + jitter(6),
    size: 176,
    rot: jitter(3),
    z: others.length + 1,
  };
  return [hero, ...others];
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

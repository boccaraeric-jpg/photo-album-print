import type { Photo, PhotoSize, ProPhotoSize } from './types';
import { stripMarks } from './richText';

/**
 * Petite = grille 2×2, moyenne = 2 empilées, grande = pleine page (avec légende),
 * pleine = photo bord à bord sur toute la page.
 */
export const PER_PAGE: Record<PhotoSize, number> = {
  small: 4,
  medium: 2,
  large: 1,
  full: 1,
};

/** Au-delà de cette longueur, le commentaire vaut à sa photo une page entière. */
const LONG_COMMENT = 160;

export function isLongComment(photo: Photo, scale = 1): boolean {
  // Sur le texte NU : les marques de mise en forme ne doivent pas faire basculer
  // une photo sur une page entière. Commentaire plus grand (`scale`) → seuil
  // plus bas : il prend autant de lignes qu'un plus long en petit corps.
  return stripMarks(photo.comment).trim().length > LONG_COMMENT / scale;
}

/** Une page de l'album : soit des photos (d'une seule taille), soit une page de texte seule. */
export type AlbumPage =
  | {
      type: 'photos';
      items: Photo[];
      size: PhotoSize;
      /**
       * Photo seule **agrandie** (gabarit « solo ») : commentaire très long, ou
       * dernière photo restante qui suit la taille de l'album. Une photo dont la
       * taille a été choisie (`Photo.size`) n'est jamais agrandie : seule sur sa
       * page, une « petite » garde sa case de grille, une « moyenne » sa
       * demi-page.
       */
      solo: boolean;
    }
  | { type: 'text'; item: Photo };

/** Couleur de fond propre à une page (`Photo.pageBg`), si valable. */
export function pageBackground(items: Photo[]): string | undefined {
  for (const p of items) {
    if (p.pageBg && /^#[0-9a-f]{6}$/i.test(p.pageBg)) return p.pageBg;
  }
  return undefined;
}

export interface PaginateOptions {
  /** Photos avec carte à côté (grille 2×2 : une ligne entière, cf. `wideSlots`). */
  wide?: Set<string>;
  /** Échelle du commentaire : abaisse le seuil de page seule (`isLongComment`). */
  commentScale?: number;
  /** Honorer la taille propre à chaque photo (`Photo.size`) — familial seulement. */
  perPhotoSize?: boolean;
}

/**
 * Répartit les entrées (photos + pages de texte) en pages. Les pages de texte
 * sont toujours autonomes ; une photo au commentaire très long (ou la taille
 * « grande / pleine ») obtient sa page à elle. L'ordre reçu est conservé.
 *
 * Taille : celle de l'album, sauf photo qui a la sienne (`Photo.size`, choisie
 * dans l'aperçu). Une page ne mélange jamais deux tailles : un changement de
 * taille commence une nouvelle page.
 *
 * `wide` : en grille 2×2, une photo avec carte prend une ligne entière, soit
 * deux cases, et commence toujours une ligne.
 */
export function paginateEntries(
  entries: Photo[],
  albumSize: PhotoSize,
  { wide, commentScale = 1, perPhotoSize = false }: PaginateOptions = {},
): AlbumPage[] {
  const pages: AlbumPage[] = [];
  let group: Photo[] = [];
  let groupSize: PhotoSize = albumSize;
  const flush = () => {
    if (group.length) {
      const chosen = perPhotoSize && !!group[0].size;
      const solo = group.length === 1 && PER_PAGE[groupSize] > 1 && !chosen;
      pages.push({ type: 'photos', items: group, size: groupSize, solo });
      group = [];
    }
  };
  for (const e of entries) {
    if (e.kind === 'text') {
      flush();
      pages.push({ type: 'text', item: e });
      continue;
    }
    const size = (perPhotoSize && e.size) || albumSize;
    const perPage = PER_PAGE[size];
    if (group.length && size !== groupSize) flush();
    groupSize = size;
    if (perPage <= 1 || isLongComment(e, commentScale)) {
      flush();
      pages.push({ type: 'photos', items: [e], size, solo: perPage > 1 });
      continue;
    }
    const w = perPage === 4 ? wide : undefined;
    if (w && slotsUsed([...group, e], w) > 4) flush();
    group.push(e);
    if (slotsUsed(group, w) >= perPage) flush();
  }
  flush();
  return pages;
}

/**
 * Cases de la grille 2×2 occupées par un groupe : `[début, nombre]` par photo.
 * Une photo « large » (avec carte) saute à la ligne suivante si besoin et
 * prend les deux cases de la ligne.
 */
export function wideSlots(group: Photo[], wide?: Set<string>): [number, number][] {
  let slot = 0;
  return group.map((p) => {
    if (wide?.has(p.id)) {
      if (slot % 2) slot++;
      const r: [number, number] = [slot, 2];
      slot += 2;
      return r;
    }
    return [slot++, 1];
  });
}

function slotsUsed(group: Photo[], wide?: Set<string>): number {
  const s = wideSlots(group, wide);
  const last = s[s.length - 1];
  return last ? last[0] + last[1] : 0;
}

/* --------------------------------------------------------------------------
 * Rapport professionnel : pages explicites
 * ------------------------------------------------------------------------ */

/**
 * Gabarit des pages du rapport pro (points A4), partagé par le PDF et les
 * images. Les fiches s'empilent depuis le haut ; leur hauteur est **estimée**
 * (vignette + lignes de la fiche) pour ne jamais dépasser une page.
 */
export const PRO_LAYOUT = {
  pageH: 842,
  padTop: 40,
  /** Pied : numéro de page, et mention de l'app sur la dernière. */
  padBottom: 76,
  /** Vignette par taille ; réduite quand le texte grandit (`proFrameH`). */
  frame: { small: 150, medium: 210, large: 470 } as Record<ProPhotoSize, number>,
  /** « Photo n° » + son écart. */
  head: 21,
  metaTop: 12,
  row: 26,
  descLine: 18,
  entryGap: 22,
  /** Caractères par ligne de description (corps normal) : pleine / demi-largeur. */
  charsFull: 58,
  charsHalf: 20,
};

/**
 * Colonne des intitulés d'une petite fiche (points A4, corps normal) : assez
 * large pour « DESCRIPTION » en capitales espacées, le plus long.
 */
export const PRO_SMALL_DT = 88;

/** Hauteur de la vignette d'une fiche pro, réduite quand le texte grandit. */
export function proFrameH(size: ProPhotoSize, scale: number): number {
  const give = size === 'large' ? 150 : 90;
  return PRO_LAYOUT.frame[size] - Math.round((scale - 1) * give);
}

/** Hauteur estimée d'une fiche pro (points A4). */
export function proEntryHeight(
  photo: Photo,
  size: ProPhotoSize,
  scale: number,
  rows: number,
): number {
  const L = PRO_LAYOUT;
  const perLine = Math.max(8, Math.floor((size === 'small' ? L.charsHalf : L.charsFull) / scale));
  const text = stripMarks(photo.comment).trim() || '—';
  const lines = text
    .split('\n')
    .reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
  return (
    L.head * scale +
    proFrameH(size, scale) +
    L.metaTop +
    // Demi-largeur : lieu et date passent souvent sur deux lignes.
    rows * L.row * scale * (size === 'small' ? 1.7 : 1) +
    lines * L.descLine * scale +
    10 +
    L.entryGap
  );
}

/**
 * Pages du rapport pro. Une page ne mélange pas deux tailles ; les petites se
 * rangent deux par ligne ; une grande a toujours sa page. Une page se ferme
 * dès que la fiche suivante la ferait déborder (hauteur estimée). Les pages de
 * texte restent autonomes. `rows` = lignes fixes de chaque fiche (lieu, date).
 */
export function paginateProEntries(
  entries: Photo[],
  scale: number,
  rows: number,
  /** Taille du rapport (mise en page), sauf photo réglée dans l'aperçu. */
  reportSize: ProPhotoSize = 'medium',
): AlbumPage[] {
  const L = PRO_LAYOUT;
  const room = L.pageH - L.padTop - L.padBottom;
  const pages: AlbumPage[] = [];
  let group: Photo[] = [];
  let size: ProPhotoSize = 'medium';
  const height = (g: Photo[], sz: ProPhotoSize) => {
    if (sz !== 'small') return g.reduce((h, p) => h + proEntryHeight(p, sz, scale, rows), 0);
    let h = 0;
    for (let i = 0; i < g.length; i += 2) {
      h += Math.max(...g.slice(i, i + 2).map((p) => proEntryHeight(p, sz, scale, rows)));
    }
    return h;
  };
  const flush = () => {
    if (group.length) pages.push({ type: 'photos', items: group, size, solo: false });
    group = [];
  };
  for (const e of entries) {
    if (e.kind === 'text') {
      flush();
      pages.push({ type: 'text', item: e });
      continue;
    }
    const sz = e.proSize ?? reportSize;
    if (group.length && (sz !== size || sz === 'large' || height([...group, e], sz) > room)) {
      flush();
    }
    size = sz;
    group.push(e);
  }
  flush();
  return pages;
}

import type { Photo, PhotoSize } from './types';
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

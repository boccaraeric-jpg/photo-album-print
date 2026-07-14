import type { ExportOptions, Photo } from './types';

/**
 * Petite = grille 2×2, moyenne = 2 empilées, grande = pleine page (avec légende),
 * pleine = photo bord à bord sur toute la page.
 */
export const PER_PAGE: Record<ExportOptions['photoSize'], number> = {
  small: 4,
  medium: 2,
  large: 1,
  full: 1,
};

/** Au-delà de cette longueur, le commentaire vaut à sa photo une page entière. */
const LONG_COMMENT = 160;

export function isLongComment(photo: Photo): boolean {
  return photo.comment.trim().length > LONG_COMMENT;
}

/** Une page de l'album : soit des photos, soit une page de texte seule. */
export type AlbumPage =
  | { type: 'photos'; items: Photo[] }
  | { type: 'text'; item: Photo };

/**
 * Répartit les entrées (photos + pages de texte) en pages. Les pages de texte
 * sont toujours autonomes ; une photo au commentaire très long (ou la taille
 * « grande / pleine ») obtient sa page à elle. L'ordre reçu est conservé.
 */
export function paginateEntries(entries: Photo[], perPage: number): AlbumPage[] {
  const pages: AlbumPage[] = [];
  let group: Photo[] = [];
  const flush = () => {
    if (group.length) {
      pages.push({ type: 'photos', items: group });
      group = [];
    }
  };
  for (const e of entries) {
    if (e.kind === 'text') {
      flush();
      pages.push({ type: 'text', item: e });
      continue;
    }
    if (perPage <= 1 || isLongComment(e)) {
      flush();
      pages.push({ type: 'photos', items: [e] });
      continue;
    }
    group.push(e);
    if (group.length >= perPage) flush();
  }
  flush();
  return pages;
}

import type { ExportOptions, Photo } from './types';

/** Petite = grille 2×2, moyenne = 2 empilées, grande = pleine page. */
export const PER_PAGE: Record<ExportOptions['photoSize'], number> = {
  small: 4,
  medium: 2,
  large: 1,
};

/** Au-delà de cette longueur, le commentaire vaut à sa photo une page entière. */
const LONG_COMMENT = 160;

export function isLongComment(photo: Photo): boolean {
  return photo.comment.trim().length > LONG_COMMENT;
}

/**
 * Répartit les photos en pages de `perPage`. Une photo au commentaire très long
 * obtient sa page à elle, pour laisser la place au texte. L'ordre reçu est
 * conservé (les photos arrivent déjà triées selon l'ordre manuel du dossier).
 */
export function paginatePhotos(photos: Photo[], perPage: number): Photo[][] {
  if (perPage <= 1) return photos.map((p) => [p]);
  const pages: Photo[][] = [];
  let i = 0;
  while (i < photos.length) {
    if (isLongComment(photos[i])) {
      pages.push([photos[i]]);
      i++;
      continue;
    }
    const group: Photo[] = [];
    while (
      group.length < perPage &&
      i < photos.length &&
      !isLongComment(photos[i])
    ) {
      group.push(photos[i]);
      i++;
    }
    pages.push(group);
  }
  return pages;
}

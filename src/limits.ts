import type { Photo } from './types';

/**
 * Nombre maximal de photos par dossier, dans toutes les versions. Au-delà, le
 * PDF et l'aperçu (un seul document en mémoire, toutes les photos incluses),
 * l'album ComClic et le ZIP des images (archives construites en mémoire)
 * dépasseraient ce que le téléphone peut préparer, et le fichier ce qu'une
 * messagerie accepte. Les pages de texte ne comptent pas.
 *
 * Appliqué à l'**ajout** (photothèque, appareil photo, partage entrant, album
 * reçu) : on ne laisse jamais construire un album qu'on ne pourrait pas
 * envoyer. Une restauration de sauvegarde n'est pas limitée (données de
 * l'utilisateur), un dossier déjà au-delà n'est jamais amputé.
 */
export const MAX_ALBUM_PHOTOS = 100;

/** Photos (hors pages de texte) d'un dossier. */
export function photoCountIn(albumId: string, photos: Photo[]): number {
  let n = 0;
  for (const p of photos) if (p.albumId === albumId && p.kind !== 'text') n++;
  return n;
}

/** Place restante dans un dossier (0 si plein). */
export function photoRoomIn(albumId: string, photos: Photo[]): number {
  return Math.max(0, MAX_ALBUM_PHOTOS - photoCountIn(albumId, photos));
}

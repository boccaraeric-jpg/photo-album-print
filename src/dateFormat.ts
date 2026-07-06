import type { DateFormat, Photo } from './types';

/** Date à afficher pour une photo : prise de vue réelle si connue, sinon date d'ajout. */
export function photoDate(photo: Photo): number {
  return photo.takenAt ?? photo.createdAt;
}

/** Met une majuscule à la première lettre (les jours/mois `fr-FR` sont en minuscules). */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Formate un timestamp selon le format choisi :
 * - `short` → « 08/07/2026 »
 * - `long`  → « Mercredi 8 juillet 2026 »
 * - `full`  → « Mercredi 8 juillet 2026 à 19h37 »
 * - `none`  → chaîne vide
 */
export function formatPhotoDate(ts: number, format: DateFormat): string {
  const d = new Date(ts);
  switch (format) {
    case 'none':
      return '';
    case 'short':
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    case 'long':
      return cap(
        d.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      );
    case 'full': {
      const day = cap(
        d.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      );
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${day} à ${hh}h${mm}`;
    }
  }
}

/** Date courte « JJ-MM-AAAA » (tirets, pour un nom de fichier valide). */
export function fileDateStamp(ts: number = Date.now()): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

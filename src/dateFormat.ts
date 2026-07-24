import { localeTag, type Lang } from './i18n';
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
export function formatPhotoDate(
  ts: number,
  format: DateFormat,
  lang: Lang = 'fr',
): string {
  const d = new Date(ts);
  const tag = localeTag(lang);
  // Heure localisée : « 19h37 » en français, « 7:37 PM » en anglais.
  const time = () => {
    if (lang === 'en') {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}h${mm}`;
  };
  const at = lang === 'en' ? 'at' : 'à';
  switch (format) {
    case 'none':
      return '';
    case 'short':
      return d.toLocaleDateString(tag, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    case 'shortTime': {
      const day = d.toLocaleDateString(tag, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      return `${day} ${at} ${time()}`;
    }
    case 'long':
      return cap(
        d.toLocaleDateString(tag, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      );
    case 'full': {
      const day = cap(
        d.toLocaleDateString(tag, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      );
      return `${day} ${at} ${time()}`;
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

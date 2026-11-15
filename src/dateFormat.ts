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
 * Usage français : le premier du mois s'écrit « 1er » (« vendredi 1er août »).
 * Ne touche que le quantième suivi d'un nom de mois, jamais « 01/08/2025 ».
 */
function frenchFirst(text: string, lang: Lang): string {
  return lang === 'fr' ? text.replace(/(^|\s)1 (?=[a-zéû])/, '$11er ') : text;
}

/**
 * Formate un timestamp selon le format choisi :
 * - `dayMonth` → « 8 juillet » (sans l'année)
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
    // « 9 h 41 » : heure sans zéro initial, espaces autour du « h ».
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getHours()} h ${mm}`;
  };
  const at = lang === 'en' ? 'at' : 'à';
  switch (format) {
    case 'none':
      return '';
    case 'dayMonth':
      // « 8 juillet » / « July 8 » : la date la plus légère, sans l'année.
      return frenchFirst(d.toLocaleDateString(tag, { day: 'numeric', month: 'long' }), lang);
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
        frenchFirst(
          d.toLocaleDateString(tag, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          lang,
        ),
      );
    case 'full': {
      const day = cap(
        frenchFirst(
          d.toLocaleDateString(tag, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
          lang,
        ),
      );
      return `${day} ${at} ${time()}`;

    }
  }
}

/**
 * Format de date du rapport professionnel : « Détaillée » y porte l'heure de
 * prise de vue (une expertise date ses constats à la minute).
 */
export function reportDateFormat(format: DateFormat): DateFormat {
  return format === 'long' ? 'full' : format;
}

/** Date courte « JJ-MM-AAAA » (tirets, pour un nom de fichier valide). */
export function fileDateStamp(ts: number = Date.now()): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/**
 * Date d'une ligne de la table récapitulative du rapport pro. En anglais le
 * mois s'écrit en lettres (« Sep 10, 2026 at 11:09 AM ») : « 09/10/2026 » se
 * lit 10 septembre aux États-Unis et 9 octobre au Royaume-Uni, ambiguïté
 * qu'un rapport ne peut pas se permettre. Le français garde « 10/09/2026 ».
 */
export function summaryDate(ts: number, lang: Lang = 'fr'): string {
  if (lang !== 'en') return formatPhotoDate(ts, 'shortTime', lang);
  const d = new Date(ts);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

import type { Lang } from './i18n';

/*
 * Écriture d'un lieu et de la ligne « lieu · date » sous une photo, commune
 * aux deux moteurs de rendu (PDF et images Skia).
 *
 * La ligne entière passait en minuscules (choix de style pour la date) : les
 * noms propres y perdaient leur majuscule — « porto moniz, portugal ». Seule la
 * date est désormais mise en minuscules ; le lieu garde ses majuscules, et les
 * reçoit s'il a été saisi sans (« porto moniz » tapé à la main).
 */

/** Mots de liaison qui restent en minuscules à l'intérieur d'un nom de lieu. */
const PARTICLES = new Set([
  // français
  'de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'au', 'aux', 'lès', 'lez',
  'à', 'd', 'l',
  // autres langues courantes dans les noms de lieux
  'of', 'the', 'and', 'on', 'upon', 'in', 'da', 'do', 'dos', 'das', 'del', 'di', 'della',
  'von', 'van', 'der', 'den', 'am', 'an', 'im', 'y', 'e',
]);

/** Suite de lettres (accents compris), sans `\p{…}` — non pris en charge partout par Hermes. */
// Latin étendu compris (U+0100 – U+024F, U+1E00 – U+1EFF) : sans lui « Mellieħa »
// était coupé à son « ħ » et ressortait « MellieħA ».
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ɏḀ-ỿ]+/g;

/**
 * Nom de lieu avec ses majuscules : première lettre de chaque mot en capitale,
 * sauf les mots de liaison à l'intérieur du nom (« Baume-les-Messieurs »,
 * « Saint-Cyr-sur-Mer », « Villeneuve-d'Ascq »). Les autres lettres ne sont
 * jamais modifiées : « USA » ou « McDonald » restent tels quels.
 */
export function properPlace(place: string): string {
  const text = place.trim();
  let first = true;
  return text.replace(WORD, (word, offset: number) => {
    // Un mot de liaison garde sa minuscule, sauf en tête d'un segment
    // (début du lieu, ou après une virgule : « Le Havre, La Réunion »).
    const before = text.slice(0, offset).trimEnd();
    const leads = first || before.endsWith(',');
    first = false;
    if (!leads && PARTICLES.has(word.toLowerCase())) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/**
 * Ligne « lieu · date » sous une photo : lieu en nom propre, date en minuscules
 * (style de l'album). En anglais la date garde ses majuscules — les jours et
 * les mois y sont des noms propres.
 */
/**
 * Coordonnées GPS lisibles : « 32,7607° N, 16,9595° O » (décimale et points
 * cardinaux de la langue). Quatre décimales ≈ 10 m.
 */
export function formatCoords(coords: { lat: number; lon: number }, lang: Lang): string {
  const part = (v: number, pos: string, neg: string) => {
    const n = Math.abs(v).toFixed(4);
    return `${lang === 'fr' ? n.replace('.', ',') : n}° ${v >= 0 ? pos : neg}`;
  };
  return `${part(coords.lat, 'N', 'S')}, ${part(coords.lon, 'E', lang === 'fr' ? 'O' : 'W')}`;
}

export function metaLine(place: string | undefined, date: string, lang: Lang): string {

  const shownDate = lang === 'en' ? date : date.toLowerCase();
  return [place ? properPlace(place) : '', shownDate].filter(Boolean).join(' · ');
}

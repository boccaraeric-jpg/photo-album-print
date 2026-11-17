import type { Lang } from './i18n';

/*
 * Retouches typographiques faites **à l'affichage** de l'album (PDF et
 * images) ; le texte enregistré n'est jamais modifié.
 */

const ACCENTS = /[àâçéèêëîïôùûœ]/i;
const FRENCH_WORDS =
  /(?:^|[\s'’(])(?:le|la|les|des|une|est|et|du|que|pour|dans|nous|sur|au|de)(?=[\s,.;:!?)]|$)/gi;

/** Vrai si le texte a tout l'air d'être du français (accents ou mots-outils). */
function looksFrench(text: string): boolean {
  return ACCENTS.test(text) || (text.match(FRENCH_WORDS)?.length ?? 0) >= 2;
}

/* Lettre élidée restée seule devant une voyelle ou un h : « d un », « C est ». */
const ELISION = /(^|[\s(«"“*_])(qu|[cdjlmnst]) +(?=[aeiouyhàâéèêëîïôûœ])/gi;

/**
 * Rétablit l'apostrophe d'une élision tapée avec une espace (« d un danger »,
 * « C est », « s approchant » — clavier ou dictée, retour testeur). Ne vaut
 * que pour un texte français. Une **majuscule** isolée n'est reprise qu'en
 * début de phrase : « plan B et », « taille S ou M » restent tels quels.
 */
export function fixElisions(text: string, lang: Lang): string {
  if (!text || (lang !== 'fr' && !looksFrench(text))) return text;
  return text.replace(ELISION, (match, pre: string, letter: string, offset: number) => {
    if (letter !== letter.toLowerCase()) {
      const before = text.slice(0, offset + pre.length).replace(/[\s(«"“*_]+$/, '');
      if (before && !/[.!?…]$/.test(before)) return match;
    }
    return `${pre}${letter}’`;
  });
}

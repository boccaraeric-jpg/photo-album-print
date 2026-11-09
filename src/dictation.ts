import type { Lang } from './i18n';

/**
 * Ponctuation **parlée** de la dictée. La reconnaissance tourne sans
 * ponctuation automatique (`addsPunctuation: false`) : iOS mettait un point à
 * chaque pause, si bien qu'une hésitation coupait la phrase. Ce sont les mots
 * prononcés qui ponctuent — « point », « virgule », « à la ligne »… — comme la
 * dictée du clavier iPhone.
 *
 * Motifs écrits sans `\b` ni `\p{…}` : `\b` ignore les lettres accentuées
 * (« à la ligne » n'était jamais reconnu) et Hermes gère mal les classes
 * Unicode. Les lettres sont listées à la main.
 */

const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿŒœ';
const LOWER = 'a-zà-öø-ÿœ';

/** Expression en mot entier (pas au milieu d'un autre mot), insensible à la casse. */
function word(expr: string): RegExp {
  return new RegExp(`(^|[^${LETTERS}])(?:${expr})(?![${LETTERS}])`, 'gi');
}

/** Mot parlé → signe. Les expressions longues d'abord (« point d'interrogation » avant « point »). */
const SPOKEN: Record<Lang, [RegExp, string][]> = {
  fr: [
    [word("point d['’]interrogation"), '?'],
    [word("point d['’]exclamation"), '!'],
    [word('points de suspension'), '…'],
    [word('point[- ]virgule'), ';'],
    [word('deux[- ]points'), ':'],
    [word('nouveau paragraphe'), '\n\n'],
    [word('retour à la ligne|à la ligne|nouvelle ligne'), '\n'],
    [word('ouvre[zr]? les guillemets'), '« '],
    [word('ferme[zr]? les guillemets'), ' »'],
    [word('virgule'), ','],
  ],
  en: [
    [word('question mark'), '?'],
    [word('exclamation (?:mark|point)'), '!'],
    [word('semicolon'), ';'],
    [word('colon'), ':'],
    [word('new paragraph'), '\n\n'],
    [word('new line|next line'), '\n'],
    [word('comma'), ','],
    [word('full stop|period'), '.'],
  ],
};

/**
 * « point » seul devient « . », sauf dans les expressions où c'est un nom :
 * « point de vue », « point du jour », « au point », « mettre au point »…
 */
const POINT = new RegExp(
  `(^|[^${LETTERS}])(au\\s+)?point(?![${LETTERS}])(?!\\s+(?:de|du|des|d['’]|final|culminant|commun|fort|faible|noir|chaud|mort|cardinal))`,
  'gi',
);

/**
 * Transforme la ponctuation dite à voix haute en signes, avec la typographie de
 * la langue (espace insécable avant « ; : ! ? » en français), et met une
 * majuscule après une fin de phrase.
 */
export function applySpokenPunctuation(text: string, lang: Lang): string {
  let s = text;
  for (const [re, sign] of SPOKEN[lang] ?? SPOKEN.fr) s = s.replace(re, (_m, before: string) => before + sign);
  if (lang === 'fr') {
    s = s.replace(POINT, (m: string, before: string, au?: string) => (au ? m : `${before}.`));
  }
  // Pas d'espace avant un signe, une seule après.
  s = s.replace(/[ \t]+([.,;:!?…»])/g, '$1');
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/([.,;:!?…])(?=[^\s.,;:!?…»)])/g, '$1 ');
  // Signes répétés (« point point ») : un seul.
  s = s.replace(/([.,;:!?])\1+/g, '$1');
  if (lang === 'fr') {
    // Espace insécable avant les signes doubles, comme en typographie française.
    s = s.replace(/([^\s ])([;:!?»])/g, '$1 $2');
    s = s.replace(/«[ \t]*/g, '« ');
  }
  // Majuscule en début de texte et après . ! ? … (suivi d'une espace ou d'un
  // retour à la ligne). Un retour à la ligne SANS point ne la déclenche pas.
  // Le premier mot est ensuite tranché par `VoiceCommentButton` selon le texte
  // qui précède la dictée.
  s = s.replace(
    new RegExp(`(^|[.!?…]\\s+)([${LOWER}])`, 'g'),
    (_m, before: string, c: string) => before + c.toUpperCase(),
  );
  return s.replace(/[ \t]{2,}/g, ' ');
}

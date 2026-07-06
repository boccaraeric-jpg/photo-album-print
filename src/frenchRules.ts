import type { SpellMatch } from './spellcheck';

// Règles françaises pour les fautes que le dictionnaire ne peut PAS détecter
// (le mot fautif est un vrai mot) : confusions d'expressions, homophones dans
// des locutions figées, et élisions manquantes. Hors-ligne et déterministe.

interface Rule {
  re: RegExp;
  /** Suggestion construite depuis le résultat (groupes capturés). */
  build: (m: RegExpExecArray) => string;
  message: string;
}

const RULES: Rule[] = [
  // --- Confusions « tant » / « temps » dans des locutions figées ---
  { re: /\btout le tant\b/gi, build: () => 'tout le temps', message: '« tant » → « temps ».' },
  { re: /\bde tant en tant\b/gi, build: () => 'de temps en temps', message: '« tant » → « temps ».' },
  { re: /\ben même tant\b/gi, build: () => 'en même temps', message: '« tant » → « temps ».' },
  { re: /\bla plupart du tant\b/gi, build: () => 'la plupart du temps', message: '« tant » → « temps ».' },
  { re: /\bde temps à autres\b/gi, build: () => 'de temps à autre', message: 'Locution figée.' },

  // --- Autres confusions/expressions fréquentes ---
  { re: /\bmalgré que\b/gi, build: () => 'bien que', message: '« malgré que » est déconseillé ; préférez « bien que ».' },
  { re: /\bau jour d['’ ]aujourd['’ ]hui\b/gi, build: () => "aujourd'hui", message: 'Pléonasme ; « aujourd’hui » suffit.' },
  { re: /\bvoir même\b/gi, build: () => 'voire même', message: '« voir » → « voire ».' },
  { re: /\bautant pour moi\b/gi, build: () => 'au temps pour moi', message: 'Expression figée : « au temps pour moi ».' },
  { re: /\bavoir à faire à\b/gi, build: () => 'avoir affaire à', message: '« à faire » → « affaire ».' },

  // --- Élision manquante : « c est » → « c'est », « l orthographe » → « l'orthographe »… ---
  {
    re: /\b(c|d|j|l|m|n|s|t|qu)\s+([aeiouyhàâäéèêëîïôöûùüAEIOUYHÀÂÄÉÈÊËÎÏÔÖÛÙÜ][a-zA-ZÀ-ÿ'’-]*)/g,
    build: (m) => `${m[1]}'${m[2]}`,
    message: 'Élision manquante (apostrophe).',
  },
];

/** Met une majuscule initiale si l'original commençait par une majuscule. */
function alignCase(suggestion: string, original: string): string {
  if (original[0] && original[0] !== original[0].toLowerCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/** Fautes de grammaire/expression détectées par règles, dans l'ordre de lecture. */
export function ruleMatches(text: string): SpellMatch[] {
  const out: SpellMatch[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const bad = m[0];
      const suggestion = alignCase(rule.build(m), bad);
      // Ignore si la suggestion est identique (rien à corriger).
      if (suggestion === bad) continue;
      out.push({
        offset: m.index,
        length: bad.length,
        bad,
        message: rule.message,
        suggestions: [suggestion],
      });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

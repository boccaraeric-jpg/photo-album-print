// Correcteur français 100 % hors-ligne (aucun réseau, aucun quota). Combine :
//  - un index PHONÉTIQUE précalculé (~336 000 formes, src/frenchPhonetic.json)
//    pour l'orthographe (« hortograf » → « orthographe » : Levenshtein 5 mais
//    même code « ORTOGRAF »), complété par Levenshtein ≤ 2 ;
//  - des RÈGLES de grammaire/expression (frenchRules) pour les fautes où le mot
//    est valide (« tout le tant » → « tout le temps », élisions…).
import { ruleMatches } from './frenchRules';

export interface SpellMatch {
  offset: number;
  length: number;
  /** Fragment fautif (tel qu'écrit). */
  bad: string;
  message: string;
  /** Suggestions (au plus 6, casse alignée sur l'original). */
  suggestions: string[];
}

export interface SpellChoice {
  offset: number;
  length: number;
  value: string;
}

let DICT: Set<string> | null = null;
let BY_LEN: Map<number, string[]> | null = null;
let PHON: Map<string, string[]> | null = null;
let phonetic: ((w: string) => string) | null = null;

function ensureLoaded(): void {
  if (DICT) return;
  const mod = require('talisman/phonetics/french/phonetic');
  phonetic = (mod.default ?? mod) as (w: string) => string;

  // Metro inline le JSON comme objet : pas de JSON.parse à l'exécution.
  const index: Record<string, string> = require('./frenchPhonetic.json');
  DICT = new Set();
  BY_LEN = new Map();
  PHON = new Map();
  for (const code in index) {
    const words = index[code].split(' ');
    PHON.set(code, words);
    for (const w of words) {
      DICT.add(w);
      const bucket = BY_LEN.get(w.length);
      if (bucket) bucket.push(w);
      else BY_LEN.set(w.length, [w]);
    }
  }
}

/** Distance de Levenshtein bornée : renvoie `max + 1` dès qu'elle dépasse `max`. */
function levenshtein(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array<number>(lb + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[lb];
}

/** Suggestions pour un mot inconnu : candidats phonétiques + fautes de frappe. */
function suggest(lower: string): string[] {
  const candidates = new Set<string>(PHON!.get(phonetic!(lower)) ?? []);
  for (let L = lower.length - 2; L <= lower.length + 2; L++) {
    const bucket = BY_LEN!.get(L);
    if (!bucket) continue;
    for (const w of bucket) {
      if (!candidates.has(w) && levenshtein(lower, w, 2) <= 2) candidates.add(w);
    }
  }
  return [...candidates]
    .map((w) => ({ w, d: levenshtein(lower, w, 99) }))
    .sort(
      (a, b) =>
        a.d - b.d ||
        Math.abs(a.w.length - lower.length) -
          Math.abs(b.w.length - lower.length) ||
        a.w.localeCompare(b.w),
    )
    .slice(0, 6)
    .map((c) => c.w);
}

function matchCase(suggestion: string, original: string): string {
  if (original.length > 1 && original === original.toUpperCase()) {
    return suggestion.toUpperCase();
  }
  if (original[0] !== original[0].toLowerCase()) {
    return suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

/** Vrai si `idx` démarre une phrase (pour épargner les noms propres). */
function isSentenceStart(text: string, idx: number): boolean {
  let i = idx - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  return i < 0 || '.!?…:'.includes(text[i]);
}

const WORD_RE = /[a-zA-ZÀ-ÖØ-öø-ÿ]+/g;

/** Mots inconnus du dictionnaire (fautes d'orthographe pures). */
function dictionaryMatches(text: string): SpellMatch[] {
  const matches: SpellMatch[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    const token = m[0];
    if (token.length < 2) continue;
    const lower = token.toLowerCase();
    if (DICT!.has(lower) || DICT!.has(token)) continue;

    // Noms propres capitalisés en milieu de phrase : épargnés (faux positifs).
    const capitalized = token[0] !== token[0].toLowerCase();
    if (capitalized && !isSentenceStart(text, m.index)) continue;

    matches.push({
      offset: m.index,
      length: token.length,
      bad: token,
      message: 'Mot absent du dictionnaire.',
      suggestions: suggest(lower).map((s) => matchCase(s, token)),
    });
  }
  return matches;
}

/**
 * Analyse un texte français : fautes d'orthographe (dictionnaire) ET fautes de
 * grammaire/expression courantes que le dictionnaire ne peut pas voir car le mot
 * est valide (« tout le tant » → « tout le temps », élisions…). Les résultats
 * sont fusionnés et dédoublonnés (une même zone n'est signalée qu'une fois, la
 * règle grammaticale prioritaire sur l'orthographe).
 */
export async function checkSpelling(text: string): Promise<SpellMatch[]> {
  if (!text.trim()) return [];
  ensureLoaded();

  const all = [...ruleMatches(text), ...dictionaryMatches(text)].sort(
    (a, b) => a.offset - b.offset,
  );

  const merged: SpellMatch[] = [];
  let lastEnd = -1;
  for (const match of all) {
    if (match.offset < lastEnd) continue; // chevauche une faute déjà retenue
    merged.push(match);
    lastEnd = match.offset + match.length;
  }
  return merged;
}

/**
 * Applique les corrections choisies, de la fin vers le début pour préserver les
 * positions antérieures.
 */
export function applyChoices(text: string, choices: SpellChoice[]): string {
  let out = text;
  for (const c of [...choices].sort((a, b) => b.offset - a.offset)) {
    out = out.slice(0, c.offset) + c.value + out.slice(c.offset + c.length);
  }
  return out;
}

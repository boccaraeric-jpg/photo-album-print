/**
 * Mise en forme légère des commentaires : **gras** et __souligné__.
 *
 * Le commentaire reste une **chaîne** (`Photo.comment`) : les marques vivent
 * dans le texte lui-même. C'est volontaire — ce champ traverse AsyncStorage, le
 * paquet `.comclic`, le `contexte.txt` du ZIP, la dictée et le correcteur. Un
 * modèle riche (tableau de segments) aurait imposé une migration à chacun.
 *
 * Le correcteur n'est pas perturbé : ses jetons sont des suites de lettres,
 * `*` et `_` n'en font pas partie et ne décalent donc aucun offset.
 *
 * Marques **non imbriquables par paire mixte** au sens strict : le parseur est
 * une bascule d'état, `**a __b** c__` donne un résultat raisonnable plutôt
 * qu'une erreur. Les boutons de l'éditeur ne produisent que des paires propres.
 */

/** Fragment de texte homogène (même graisse, même soulignement). */
export interface RichRun {
  text: string;
  bold: boolean;
  underline: boolean;
}

export type RichMark = 'bold' | 'underline';

const MARKS: Record<RichMark, string> = { bold: '**', underline: '__' };

/** Découpe un commentaire balisé en fragments de style homogène. */
export function parseRich(input: string): RichRun[] {
  const runs: RichRun[] = [];
  let bold = false;
  let underline = false;
  let buf = '';
  const flush = () => {
    if (buf) runs.push({ text: buf, bold, underline });
    buf = '';
  };
  for (let i = 0; i < input.length; i++) {
    const pair = input.slice(i, i + 2);
    if (pair === MARKS.bold) {
      flush();
      bold = !bold;
      i++;
      continue;
    }
    if (pair === MARKS.underline) {
      flush();
      underline = !underline;
      i++;
      continue;
    }
    buf += input[i];
  }
  flush();
  return runs;
}

/** Texte nu, marques retirées (longueurs, troncatures, noms de fichiers…). */
export function stripMarks(input: string): string {
  return input.replace(/\*\*|__/g, '');
}

/** Vrai si le texte porte au moins une marque de mise en forme. */
export function hasMarks(input: string): boolean {
  return /\*\*|__/.test(input);
}

/**
 * Rend un commentaire balisé en HTML (PDF et aperçu WebView). L'échappement
 * est appliqué fragment par fragment : les marques sont consommées avant, donc
 * jamais échappées, et le texte utilisateur ne peut pas injecter de balise.
 */
export function richToHtml(
  input: string,
  escape: (s: string) => string,
): string {
  return parseRich(input)
    .map((run) => {
      let html = escape(run.text);
      if (run.underline) html = `<u>${html}</u>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

export interface Selection {
  start: number;
  end: number;
}

/**
 * Pose ou retire une marque sur la sélection courante de l'éditeur.
 *
 * - **sélection vide → tout le commentaire** : c'est la réponse à « comment
 *   mettre tout le texte en gras », sans imposer un « Tout sélectionner » que
 *   personne ne trouve. Insérer une paire vide au curseur (1ʳᵉ version) ne
 *   servait à rien — on ne peut pas « taper en gras », le curseur ressortait
 *   de la paire à la frappe suivante ;
 * - sélection déjà encadrée par la marque → la retire (bascule) ;
 * - sinon → encadre la sélection, espaces de bord exclus (`**mot** ` et non
 *   `**mot **`, qui se rendrait mal et gênerait la relecture).
 */
export function toggleMark(
  text: string,
  selection: Selection,
  mark: RichMark,
): { text: string; selection: Selection } {
  const m = MARKS[mark];
  const len = m.length;
  let start = Math.max(0, Math.min(selection.start, text.length));
  let end = Math.max(start, Math.min(selection.end, text.length));

  // Rien de sélectionné → toute la zone de texte.
  if (start === end) {
    if (!text.trim()) return { text, selection };
    start = 0;
    end = text.length;
  }

  // Resserre la sélection sur le texte utile (un double-clic emporte souvent
  // l'espace suivant).
  const raw = text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  const from = start + lead;
  const to = end - trail;
  if (from >= to) return { text, selection };
  const inner = text.slice(from, to);

  // Déjà marqué (marques juste à l'extérieur, ou incluses dans la sélection).
  if (text.slice(from - len, from) === m && text.slice(to, to + len) === m) {
    return {
      text: text.slice(0, from - len) + inner + text.slice(to + len),
      selection: { start: from - len, end: to - len },
    };
  }
  if (inner.startsWith(m) && inner.endsWith(m) && inner.length > 2 * len) {
    const bare = inner.slice(len, -len);
    return {
      text: text.slice(0, from) + bare + text.slice(to),
      selection: { start: from, end: from + bare.length },
    };
  }

  return {
    text: text.slice(0, from) + m + inner + m + text.slice(to),
    selection: { start: from, end: to + 2 * len },
  };
}

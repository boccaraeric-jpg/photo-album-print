import type { ExportOptions, Photo } from './types';
import { stripMarks } from './richText';

/**
 * Petite = grille 2×2, moyenne = 2 empilées, grande = pleine page (avec légende),
 * pleine = photo bord à bord sur toute la page.
 */
export const PER_PAGE: Record<ExportOptions['photoSize'], number> = {
  small: 4,
  medium: 2,
  large: 1,
  full: 1,
};

/** Au-delà de cette longueur, le commentaire vaut à sa photo une page entière. */
const LONG_COMMENT = 160;

export function isLongComment(photo: Photo): boolean {
  // Sur le texte NU : les marques de mise en forme ne doivent pas faire basculer
  // une photo sur une page entière.
  return stripMarks(photo.comment).trim().length > LONG_COMMENT;
}

/** Une page de l'album : soit des photos, soit une page de texte seule. */
export type AlbumPage =
  | { type: 'photos'; items: Photo[] }
  | { type: 'text'; item: Photo };

/**
 * Répartit les entrées (photos + pages de texte) en pages. Les pages de texte
 * sont toujours autonomes ; une photo au commentaire très long (ou la taille
 * « grande / pleine ») obtient sa page à elle. L'ordre reçu est conservé.
 *
 * `wide` : photos qui ont leur carte à côté. En grille 2×2 (`perPage` 4), elles
 * prennent une ligne entière, soit deux cases, et commencent toujours une ligne
 * (`wideSlots` donne les mêmes cases aux deux moteurs).
 */
export function paginateEntries(
  entries: Photo[],
  perPage: number,
  wide?: Set<string>,
): AlbumPage[] {
  const pages: AlbumPage[] = [];
  let group: Photo[] = [];
  const flush = () => {
    if (group.length) {
      pages.push({ type: 'photos', items: group });
      group = [];
    }
  };
  for (const e of entries) {
    if (e.kind === 'text') {
      flush();
      pages.push({ type: 'text', item: e });
      continue;
    }
    if (perPage <= 1 || isLongComment(e)) {
      flush();
      pages.push({ type: 'photos', items: [e] });
      continue;
    }
    if (perPage === 4 && wide && slotsUsed([...group, e], wide) > 4) flush();
    group.push(e);
    if (slotsUsed(group, perPage === 4 ? wide : undefined) >= perPage) flush();
  }
  flush();
  return pages;
}

/**
 * Cases de la grille 2×2 occupées par un groupe : `[début, nombre]` par photo.
 * Une photo « large » (avec carte) saute à la ligne suivante si besoin et
 * prend les deux cases de la ligne.
 */
export function wideSlots(group: Photo[], wide?: Set<string>): [number, number][] {
  let slot = 0;
  return group.map((p) => {
    if (wide?.has(p.id)) {
      if (slot % 2) slot++;
      const r: [number, number] = [slot, 2];
      slot += 2;
      return r;
    }
    return [slot++, 1];
  });
}

function slotsUsed(group: Photo[], wide?: Set<string>): number {
  const s = wideSlots(group, wide);
  const last = s[s.length - 1];
  return last ? last[0] + last[1] : 0;
}

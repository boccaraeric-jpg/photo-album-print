import type { ExportOptions, PageFormat } from './types';

/**
 * Formats de page de l'album.
 *
 * Toutes les mises en page sont décrites en **unités de mise en page** : une
 * page fait toujours 595 unités de large (la largeur A4 en points, historique
 * du projet). Seule la **hauteur** change d'un format à l'autre — 842 en A4,
 * 780 en 16 × 21 (même rapport 16:21). Les gabarits horizontaux restent donc
 * identiques ; les hauteurs se retranchent de `heightCut`.
 *
 * Au moment de produire le fichier, le PDF est **réduit** à ses dimensions
 * réelles (`zoom`, `print`) : un 16 × 21 sort à 453,5 × 595,3 pt, soit 16 × 21 cm
 * exacts. Les images (Skia) gardent 1240 px de large, `imageH` en hauteur.
 */
export const PAGE_W = 595;

interface FormatSpec {
  /** Hauteur de page en unités de mise en page. */
  h: number;
  /** Dimensions réelles du PDF, en points (1 pt = 1/72 po). */
  print: { width: number; height: number };
  /** Réduction appliquée au PDF : largeur réelle / largeur de mise en page. */
  zoom: number;
  /** Hauteur des images de page (largeur 1240 px). */
  imageH: number;
}

const CM = 72 / 2.54;

export const PAGE_FORMATS: Record<PageFormat, FormatSpec> = {
  a4: { h: 842, print: { width: 595, height: 842 }, zoom: 1, imageH: 1754 },
  // 780 et non 781 : réduite, la page doit tenir dans les 595,3 pt de haut,
  // sinon la dernière fraction de point déborde et crée une page blanche.
  '16x21': {
    h: 780,
    print: { width: 16 * CM, height: 21 * CM },
    zoom: (16 * CM) / PAGE_W,
    imageH: 1628,
  },
};

export const PAGE_FORMAT_KEYS: PageFormat[] = ['a4', '16x21'];

/**
 * Format réellement rendu : le rapport professionnel reste en A4 (format
 * attendu d'un document d'expertise), le familial suit le réglage.
 */
export function effectiveFormat(options: Pick<ExportOptions, 'style' | 'format'>): PageFormat {
  return options.style === 'pro' ? 'a4' : (options.format ?? 'a4');
}

/** Hauteur de page (unités de mise en page). */
export function pageHeight(format: PageFormat): number {
  return PAGE_FORMATS[format].h;
}

/** Hauteur perdue par rapport à l'A4, à retrancher des gabarits verticaux. */
export function heightCut(format: PageFormat): number {
  return PAGE_FORMATS.a4.h - PAGE_FORMATS[format].h;
}

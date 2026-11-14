import type { ExportOptions, PageFormat } from './types';

/**
 * Formats de page de l'album.
 *
 * Le carré (16 × 16) n'est pas un simple raccourcissement : ses gabarits
 * propres (`square`) placent les photos moyennes côte à côte, la carte d'une
 * photo moyenne sous elle, et resserrent la couverture classique.
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
  /** Page carrée : gabarits dédiés (cf. en-tête). */
  square: boolean;
}

const CM = 72 / 2.54;

export const PAGE_FORMATS: Record<PageFormat, FormatSpec> = {
  a4: { h: 842, print: { width: 595, height: 842 }, zoom: 1, imageH: 1754, square: false },
  // 780 et non 781 : réduite, la page doit tenir dans les 595,3 pt de haut,
  // sinon la dernière fraction de point déborde et crée une page blanche.
  '16x21': {
    h: 780,
    print: { width: 16 * CM, height: 21 * CM },
    zoom: (16 * CM) / PAGE_W,
    imageH: 1628,
    square: false,
  },
  // 594 et non 595 : même marge de sécurité qu'en 16 × 21 (page réduite à
  // 452,8 pt de haut pour 453,5 disponibles).
  '16x16': {
    h: 594,
    print: { width: 16 * CM, height: 16 * CM },
    zoom: (16 * CM) / PAGE_W,
    imageH: 1240,
    square: true,
  },
};

export const PAGE_FORMAT_KEYS: PageFormat[] = ['a4', '16x21', '16x16'];

/**
 * Le moteur d'impression d'iOS (WebKit) ne met pas une page en page à sa
 * largeur : il la compose sur **1,25 fois** la largeur du papier (partie
 * entière), puis réduit le tout pour la faire tenir. Mesuré sur un PDF 16 × 16
 * sorti d'un iPhone (14/11/2026) : page de 453,54 pt composée sur 566 px, donc
 * rendue à 80 % — album calé en haut à gauche, couverture montée décalée, fond
 * d'une page peinte arrêté aux 4/5 de la hauteur.
 */
const IOS_PRINT_LAYOUT = 1.25;
/**
 * Marge de sûreté sur le zoom : la hauteur de page est elle aussi arrondie à
 * l'entier inférieur par iOS ; sans elle, une feuille tombant juste (16 × 21)
 * débordait d'une fraction d'unité et ajoutait une page blanche.
 */
const PRINT_SAFETY = 0.998;

/**
 * Zoom CSS à poser sur `html` pour qu'une page mise en page sur `PAGE_W`
 * unités sorte à sa taille réelle dans le PDF.
 *
 * - iOS : la largeur de composition vaut `floor(1,25 × largeur réelle)` ; le
 *   zoom y loge exactement les 595 unités, et la réduction d'iOS ramène ensuite
 *   la page à sa vraie taille.
 * - Ailleurs (Android, contrôle sous Chrome) : la page est composée à sa
 *   largeur réelle, le zoom est le simple rapport des largeurs.
 */
export function printZoom(format: PageFormat, ios: boolean): number {
  const { zoom, print } = PAGE_FORMATS[format];
  if (!ios) return zoom;
  return (Math.floor(print.width * IOS_PRINT_LAYOUT) / PAGE_W) * PRINT_SAFETY;
}

/** Vrai si l'album est en page carrée (gabarits dédiés). */
export function isSquare(format: PageFormat): boolean {
  return PAGE_FORMATS[format].square;
}

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

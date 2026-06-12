/**
 * Réglages d'image façon iPhone. Les curseurs vont de -100 à +100 (0 = neutre),
 * la rotation est en degrés (multiples de 90).
 */
export interface Adjustments {
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  rotation: number;
}

/** Taille des photos dans le PDF : petite = 3/page, moyenne = 2/page, grande = 1/page. */
export type PhotoSize = 'small' | 'medium' | 'large';

/** Style d'encadré des photos dans le PDF. */
export type FrameStyle = 'card' | 'border' | 'polaroid' | 'none';

/** Options de personnalisation du mini album exporté. */
export interface ExportOptions {
  photoSize: PhotoSize;
  /** Couleur de fond des pages (hex). */
  background: string;
  frame: FrameStyle;
}

/** Dossier de classement des photos (un PDF est exporté par dossier). */
export interface Album {
  /** Identifiant unique du dossier */
  id: string;
  /** Nom du dossier (titre de la couverture du PDF) */
  name: string;
  /** Timestamp de création (ms) */
  createdAt: number;
  /** Photo choisie pour la couverture (sinon la première du dossier) */
  coverPhotoId?: string;
}

export interface Photo {
  /** Identifiant unique de la photo */
  id: string;
  /** Identifiant du dossier auquel la photo appartient */
  albumId: string;
  /** URI persistante du fichier image affiché (ajusté si des réglages sont appliqués) */
  uri: string;
  /** Commentaire / légende associé à la photo */
  comment: string;
  /** Timestamp de création (ms) */
  createdAt: number;
  /** URI du fichier d'origine quand `uri` pointe vers une version ajustée */
  originalUri?: string;
  /** Réglages actuellement appliqués (pour ré-édition) */
  adjustments?: Adjustments;
}

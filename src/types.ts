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

export interface Photo {
  /** Identifiant unique de la photo */
  id: string;
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

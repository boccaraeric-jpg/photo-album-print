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

/**
 * Taille des photos dans le PDF : petite = 4/page, moyenne = 2/page,
 * grande = 1/page, pleine = photo bord à bord sur toute la page.
 */
export type PhotoSize = 'small' | 'medium' | 'large' | 'full';

/** Support de la photo (mutuellement exclusif). */
export type FrameStyle = 'card' | 'border' | 'polaroid' | 'none';

/**
 * Rendu global du mini album :
 * - `family` : livre photo chaleureux, personnalisable (fond, cadre, taille…).
 * - `pro`    : rapport photographique sobre et factuel (fond blanc, photos
 *              numérotées, date/heure + lieu + description) ; gabarit imposé.
 */
export type RenderStyle = 'family' | 'pro';

/**
 * Format de la date inscrite sous chaque photo.
 * - `short` : « 08/07/2026 »
 * - `long`  : « mercredi 8 juillet 2026 »
 * - `full`  : « mercredi 8 juillet 2026 à 19h37 »
 * - `none`  : date masquée
 */
export type DateFormat = 'short' | 'shortTime' | 'long' | 'full' | 'none';

/** Options de personnalisation du mini album exporté. */
export interface ExportOptions {
  /** Rendu global (familial personnalisable ou professionnel sobre). */
  style: RenderStyle;
  photoSize: PhotoSize;
  /** Couleur de fond des pages (hex) — mode familial uniquement. */
  background: string;
  /** Support de la photo (carte, bordure, polaroïd, sans cadre). */
  frame: FrameStyle;
  /** Liseré (fin trait) entourant la photo — s'ajoute au support choisi. */
  liseret: boolean;
  /** Affiche le lieu de prise de vue sous la photo — loisir et pro. */
  showPlace: boolean;
  /** Format de la date affichée sous chaque photo — mode familial. */
  dateFormat: DateFormat;
  /** Alignement de la date/lieu sous la photo — mode familial. */
  dateAlign: 'left' | 'center' | 'right';
  /** Alignement du texte des pages de texte — pro et familial. */
  textAlign: 'left' | 'center' | 'right';
}

/** Critère de tri de la liste des dossiers (écran d'accueil). */
export type AlbumSort = 'recent' | 'name' | 'size';

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
  /** Identifiant unique de l'entrée */
  id: string;
  /**
   * Type d'entrée : `photo` (défaut) ou `text` (page de texte seule, sans
   * image : `uri` vide, `comment` contient le texte de la page).
   */
  kind?: 'photo' | 'text';
  /** Identifiant du dossier auquel la photo appartient */
  albumId: string;
  /** URI persistante du fichier image affiché (ajusté si des réglages sont appliqués) */
  uri: string;
  /** Commentaire / légende (sert de « description » en rendu professionnel) */
  comment: string;
  /** Lieu de prise de vue (géocodé depuis le GPS, ou saisi à la main) */
  place?: string;
  /** Coordonnées GPS lues dans l'EXIF (pour re-géocoder au besoin) */
  coords?: { lat: number; lon: number };
  /** Timestamp d'ajout dans l'app (ms) — sert de repli et d'ordre par défaut */
  createdAt: number;
  /**
   * Timestamp de prise de vue réelle (ms), lu dans l'EXIF à l'import.
   * C'est la date affichée sous la photo ; repli sur `createdAt` si absent.
   */
  takenAt?: number;
  /**
   * Rang manuel dans le dossier (glisser-déposer). Les photos sans `order`
   * (anciennes données) retombent sur un tri par `createdAt`.
   */
  order?: number;
  /** URI du fichier d'origine quand `uri` pointe vers une version ajustée */
  originalUri?: string;
  /** Réglages actuellement appliqués (pour ré-édition) */
  adjustments?: Adjustments;
}

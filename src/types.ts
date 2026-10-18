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

/**
 * Typographie du rendu familial :
 * - `sans`   : Montserrat partout (rendu historique) ;
 * - `serif`  : Lora, titres et légendes ;
 * - `script` : Caveat (manuscrite) pour titres et légendes, Lora pour les
 *              textes longs (pages de texte, date) — une page entière en
 *              manuscrite devient vite illisible.
 */
export type Typeface = 'sans' | 'serif' | 'script';

/**
 * 1ère de couverture du rendu familial :
 * - `classic`   : titre + année + la photo de couverture (rendu historique) ;
 * - `scatter`   : pêle-mêle de polaroïds éparpillés (3 à 7 photos) ;
 * - `filmstrip` : grille cinématique jointive (4 à 9 photos).
 */
export type CoverStyle = 'classic' | 'scatter' | 'filmstrip';

/** Corps des commentaires sous les photos (rendu familial). */
export type CommentSize = 'normal' | 'large' | 'xlarge';

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
  /**
   * Position verticale du commentaire dans la bande qui lui est réservée sous
   * la photo — **familial uniquement**. Le gabarit pro dispose la description
   * en flux (une expertise ne doit jamais la tronquer), il n'a pas de bande.
   */
  commentVAlign: 'top' | 'middle' | 'bottom';
  /** Typographie — familial uniquement (le pro reste en Montserrat). */
  typeface: Typeface;
  /** Corps des commentaires — familial uniquement (cf. `COMMENT_SCALE`). */
  commentSize: CommentSize;
  /** Style de la 1ère de couverture — familial uniquement. */
  cover: CoverStyle;
  /** Page « Nos lieux de visite » après la couverture — familial uniquement. */
  showMap: boolean;
  /**
   * Carte du lieu à côté des photos géolocalisées — familial uniquement. Quelles
   * photos : règle d'office (le lieu change) corrigée par `Photo.mapMode`.
   */
  photoMaps: boolean;
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
  /**
   * Photos choisies pour la couverture pêle-mêle (3 à 9, dans l'ordre : la
   * 1ʳᵉ au centre). Absent ou invalide → sélection automatique.
   */
  scatterPhotoIds?: string[];
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
  /**
   * Carte du lieu à côté de la photo : `on` / `off` choisis par l'utilisateur ;
   * absent = d'office (une carte quand le lieu change, cf. `autoMapIds`).
   */
  mapMode?: 'on' | 'off';
  /**
   * Taille propre à cette photo, choisie dans l'aperçu (sinon celle de l'album)
   * — familial seulement. Une page ne mélange pas deux tailles.
   */
  size?: PhotoSize;
  /**
   * Fond de la page qui porte cette photo (hex 6 chiffres), choisi dans
   * l'aperçu ; sinon le fond de l'album. Rattaché à la photo et non à un numéro
   * de page : il suit la photo quand l'album change.
   */
  pageBg?: string;
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

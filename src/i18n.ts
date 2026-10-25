// Internationalisation — Phase 1 : français + anglais (extensible : ajouter une
// clé de langue dans `DICT` et son code dans `SUPPORTED`). Sans dépendance i18n
// externe. La langue est détectée au 1er lancement (langue de l'iPhone via
// expo-localization), stockée dans AsyncStorage, et surchargeable dans l'app.
//
// Deux modes d'accès :
//  - React : `useLang()` → { lang, setLang, L } où `L` est le dictionnaire de la
//    langue courante ; les composants se re-rendent quand `lang` change (Context).
//  - Hors React (pdf.ts, pageImages.ts, dateFormat.ts) : passer `lang` en
//    paramètre et lire `dict(lang)` / `localeTag(lang)`.
import { createContext, useContext } from 'react';
import { getLocales } from 'expo-localization';

export type Lang = 'fr' | 'en';
export const SUPPORTED: Lang[] = ['fr', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

/** Étiquette de locale BCP-47 pour `toLocaleDateString` & co. */
export function localeTag(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'fr-FR';
}

/** Langue de l'appareil si prise en charge, sinon la langue par défaut. */
export function detectDeviceLang(): Lang {
  try {
    for (const loc of getLocales()) {
      const code = loc.languageCode?.toLowerCase();
      if (code && (SUPPORTED as string[]).includes(code)) return code as Lang;
    }
  } catch {
    // getLocales indisponible : on garde le défaut.
  }
  return DEFAULT_LANG;
}

// Forme du dictionnaire : dérivée du français, garantit que chaque langue
// fournit exactement les mêmes clés (erreur de compilation sinon).
export type Dict = typeof fr;

const fr = {
  common: {
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
    close: 'Fermer',
    send: 'Envoyer',
    share: 'Partager',
    back: 'Retour',
    error: 'Erreur',
    ok: 'OK',
    duplicate: 'Dupliquer',
    later: 'Plus tard',
  },
  welcome: {
    kicker: 'Commentez vos photos, sauvegardez ou partagez-les',
    start: 'Commencer',
  },
  album: {
    noName: 'Sans nom',
    photoCount: (n: number) => `${n} photo${n > 1 ? 's' : ''}`,
    createdOn: (date: string) => `Créé le ${date}`,
    copyName: (name: string) => `Copie de ${name}`,
  },
  photoCard: {
    tapWriteText: 'Toucher pour écrire le texte de la page',
    tapAddComment: 'Toucher pour ajouter un commentaire',
    textPage: 'PAGE DE TEXTE',
    edit: 'Modifier',
  },
  nameModal: {
    lineHint: 'Touche Retour : passer la fin du nom à la ligne (2 lignes au plus).',
    folderPlaceholder: 'Nom du dossier',
  },
  comment: {
    textLabel: 'Texte de la page',
    commentLabel: 'Commentaire',
    textPlaceholder: 'Écrivez le texte de cette page…',
    commentPlaceholder: 'Commentez ce moment…',
    placeLabel: 'Lieu',
    placePlaceholder: 'Lieu de la prise de vue…',
    mapLabel: 'Carte du lieu à côté de la photo',
    mapAutoOn: 'Proposée d’office : le lieu change par rapport à la photo précédente.',
    mapAutoOff: 'Pas d’office : même lieu que la photo précédente.',
    mapNeedsOption: 'Visible si « Cartes à côté des photos » est activé dans la mise en page Loisir.',
    checkButton: '✓ Vérifier orthographe & grammaire',
    boldLabel: 'Gras',
    underlineLabel: 'Souligné',
    formatSelection: 'appliqué au texte sélectionné',
    formatAll: 'appliqué à tout le texte',
    tapToEdit: 'Toucher pour modifier',
    spellTitle: 'Orthographe',
    spellNone: 'Aucune faute détectée.',
    spellUnavailableTitle: 'Correcteur indisponible',
    spellUnavailableBody: "La vérification n'a pas pu aboutir. Réessaie.",
    dictate: 'Dicter',
    listening: 'À l’écoute…',
    micDeniedTitle: 'Micro non autorisé',
    micDeniedBody:
      'Autorise le micro et la reconnaissance vocale dans les réglages pour dicter tes commentaires.',
    micFailedTitle: 'Dictée indisponible',
    micFailedBody:
      'La reconnaissance vocale hors ligne n’a pas démarré. Vérifie que la dictée est activée dans Réglages → Général → Clavier, avec la langue de l’app installée.',
  },
  version: {
    embedded: 'version intégrée',
    update: 'maj',
    updating: 'Mise à jour de l’app…',
  },
  spell: {
    progress: (i: number, n: number) => `Faute ${i} sur ${n}`,
    replaceWith: 'Remplacer par :',
    noSuggestion: 'Aucune suggestion proposée.',
    ignore: 'Ignorer',
  },
  adjust: {
    title: 'Réglages',
    rotate: '⟳  Pivoter 90°',
    reset: 'Réinitialiser',
    exposure: 'Exposition',
    brightness: 'Luminosité',
    contrast: 'Contraste',
    saturation: 'Saturation',
    warmth: 'Chaleur',
  },
  camera: {
    take: 'Prendre la photo',
    flip: 'Pivoter',
    zoom: 'Zoom',
    flash: { auto: 'Flash auto', on: 'Flash activé', off: 'Flash coupé' },
  },
  paywall: {
    title: 'Passez à ComClic',
    titleUpgrade: 'Passez à la version complète',
    leadMenu: 'Un paiement unique, sans abonnement, pour profiter de ComClic sans limite.',
    leadQuota: (n: number) =>
      `Vous avez partagé vos ${n} albums d’essai. Choisissez votre version pour continuer.`,
    leadTooManyPhotos: (n: number) =>
      `La version d’essai partage des albums de ${n} photos au plus. Choisissez votre version pour partager celui-ci.`,
    leadFeature: 'Cette fonction fait partie de la version complète.',
    leadUpgrade: 'Débloquez toutes les fonctions de ComClic.',
    trialStatus: (used: number, max: number, photos: number) =>
      `Version d’essai : ${used} album${used > 1 ? 's' : ''} partagé${used > 1 ? 's' : ''} sur ${max}, ${photos} photos au plus par album`,
    recommended: 'RECOMMANDÉ',
    lightFeatures: [
      'Albums illimités, sans limite de photos',
      'PDF, images de l’album, envoi aux amis ComClic',
      '18 couleurs de fond, commentaires, dictée, correcteur',
    ],
    fullIntro: 'Tout ComClic Light, plus :',
    fullFeatures: [
      'Rapport professionnel',
      'Sauvegarde et restauration de tous vos dossiers',
      'Formats 16 × 21 et 16 × 16 cm',
      'Couvertures pêle-mêle et grille',
      'Cartes des lieux',
      'Typographies Classique et Manuscrite',
      'Annotation des photos au marqueur',
    ],
    buyLight: (price: string) => `Acheter la version Light · ${price}`,
    buyFull: (price: string) => `Acheter la version complète · ${price}`,
    buyUpgrade: (price: string) => `Passer à la version complète · ${price}`,
    oneTime: 'Paiement unique, sans abonnement. Achat lié à votre compte App Store ou Google Play.',
    restore: 'Restaurer mes achats',
    thanksTitle: 'Merci !',
    thanksBody: (full: boolean): string =>
      full ? 'Toutes les fonctions de ComClic sont débloquées.' : 'ComClic Light est débloqué : albums illimités.',
    restoredTitle: 'Achats restaurés',
    restoredBody: (full: boolean): string =>
      full ? 'Votre version complète est réactivée.' : 'Votre version Light est réactivée.',
    restoredNone: 'Aucun achat n’a été trouvé pour ce compte.',
    errorTitle: 'Achat impossible',
    errorBody: 'La boutique n’a pas pu traiter la demande. Vérifiez votre connexion, puis réessayez.',
    lockedTitle: 'Version complète',
    lockedBody: 'Cette fonction fait partie de la version complète de ComClic.',
    lockedSee: 'Découvrir',
    statusTrial: (left: number) =>
      `Version d’essai · ${left} album${left > 1 ? 's' : ''} à partager · Débloquer`,
    statusLight: 'ComClic Light · Passer à la version complète',
    restoreFullOnly: 'La restauration d’une sauvegarde fait partie de la version complète.',
  },
  annotate: {
    title: 'Annoter',
    free: 'Trait libre',
    arrow: 'Flèche',
    undo: 'Annuler le trait',
    clear: 'Tout effacer',
    widths: { thin: 'Trait fin', medium: 'Trait moyen', thick: 'Trait épais' },
    saveFail: 'Les annotations n’ont pas pu être enregistrées.',
    cropTitle: 'Recadrer la photo ?',
    cropBody: 'Le recadrage efface les annotations de cette photo.',
    cropContinue: 'Recadrer',
    droppedTitle: 'Annotations retirées',
    droppedRotate: 'La photo a été tournée : ses annotations ne tombaient plus au bon endroit.',
  },
  viewer: {
    open: 'Voir la photo en grand',
    hint: 'Pincez pour agrandir',
  },
  crop: {
    title: 'Recadrer',
    format: 'Format',
    hPosition: 'Position horizontale',
    vPosition: 'Position verticale',
    left: 'Gauche',
    center: 'Centre',
    right: 'Droite',
    top: 'Haut',
    bottom: 'Bas',
    apply: 'Appliquer',
    ratioOriginal: 'Original',
    ratioSquare: 'Carré',
    failed: 'Le recadrage a échoué.',
  },
  preview: {
    editAlbum: "‹ Modifier l'album",
    title: 'Aperçu avant envoi',
    subtitle: 'Faites défiler pour vérifier chaque page',
    subtitleEditable: 'Touchez une photo ou une page de texte pour la régler (taille, position, fond)',
    subtitleEditablePro: 'Touchez une fiche pour changer sa taille, une page de texte pour placer son texte',
    resetSizePro: (size: string) => `Revenir à la taille du rapport (${size})`,
    textPos: 'Position du texte sur la page',
    resetTextPos: (pos: string) => `Revenir à la position par défaut (${pos})`,
    textPosIsDefault: 'Position par défaut.',
    sizeIsDefaultPro: 'Taille du rapport.',
    entrySize: 'Taille de cette photo',
    resetSize: (size: string) => `Revenir à la taille de l’album (${size})`,
    sizeIsAlbum: 'Taille de l’album.',
    entryBg: 'Fond de cette page',
    resetBg: 'Revenir au fond de l’album',
    bgIsAlbum: 'Fond de l’album.',
    textPage: 'Page de texte',
    done: 'OK',
    layout: 'Mise en page',
    photoProgress: (done: number, total: number) => `Photos ${done}/${total}…`,
  },
  export: {
    title: 'Mise en page',
    sections: { style: 'Style', photos: 'Photos', texts: 'Textes', maps: 'Cartes' },
    sumLiseret: 'Liseré',
    sumPlace: 'Lieu',
    sumComment: (size: string) => `Commentaires : taille ${size.toLowerCase()}`,
    sumDate: (format: string) => `Date : ${format.toLowerCase()}`,
    sumNoDate: 'Sans date',
    sumProText: (size: string) => `Texte : taille ${size.toLowerCase()}`,
    proTextSizeLabel: 'Taille du texte',
    proSizeHints: { small: '2 côte à côte', medium: '2 par page', large: '1 par page' },
    proSizeNote: 'Une photo peut aussi être agrandie ou réduite seule dans l’aperçu.',
    proTextBoldLabel: 'Texte en gras',
    sumBold: 'gras',
    sumNoMaps: 'Pas de carte à côté des photos',
    sumMapPage: 'Page des lieux',
    sumNoPlaces: 'Aucune photo localisée',
    sizeLabel: 'Taille des photos',
    bgLabel: 'Couleur de fond de l’album',
    bgHint: 'Chaque couleur de page peut être modifiée ultérieurement dans l’aperçu.',
    formatLabel: 'Format de l’album',
    coverTitleLabel: 'Titre de la couverture',
    coverTitleHint:
      'Le nom du dossier par défaut. Allez à la ligne pour couper le titre où vous le souhaitez (3 lignes au plus).',
    formats: { a4: 'A4', '16x21': '16 × 21 cm', '16x16': '16 × 16 cm' },
    formatHints: { a4: '21 × 29,7 cm', '16x21': 'livre photo', '16x16': 'carré' },
    bgGroups: { light: 'Clairs', natural: 'Naturels', deep: 'Profonds' },
    frameLabel: 'Encadrement',
    liseretLabel: 'Liseré autour de la photo',
    placeLabel: 'Lieu de la prise de vue',
    dateLabel: 'Date sous les photos',
    datePosLabel: 'Position de la date',
    textAlignLabel: 'Alignement des textes (commentaires et pages de texte)',
    textAlignProLabel: 'Alignement des pages de texte',
    commentPosLabel: 'Hauteur du commentaire sous la photo',
    previewBtn: 'Aperçu',
    yes: 'Oui',
    no: 'Non',
    sizes: { small: 'Petite', medium: 'Moyenne', large: 'Grande', full: 'Pleine page' },
    sizeHints: {
      small: '4 / page',
      medium: '2 / page',
      large: '1 / page',
      full: 'bord à bord',
    },
    frames: { card: 'Cadre', border: 'Bordure', polaroid: 'Polaroïd', none: 'Sans cadre' },
    aligns: { left: 'Gauche', center: 'Centre', right: 'Droite' },
    commentPos: { top: 'Haut', middle: 'Milieu', bottom: 'Bas' },
    typefaceLabel: 'Typographie',
    typefaces: { sans: 'Moderne', serif: 'Classique', script: 'Manuscrite' },
    typefaceSample: 'Nos souvenirs',
    coverLabel: 'Couverture',
    covers: { classic: 'Classique', scatter: 'Pêle-mêle', filmstrip: 'Grille' },
    coverHints: { classic: '1 photo', scatter: '3 à 9 photos', filmstrip: '4 à 9 photos' },
    scatterPhotosLabel: 'Photos du pêle-mêle',
    scatterAuto: 'Automatique : la photo ★ puis les suivantes',
    scatterChosen: (n: number) => `${n} photos choisies`,
    scatterChoose: 'Choisir',
    scatterPickHint: 'Touchez de 3 à 9 photos. La première choisie va au centre, en grand.',
    scatterCount: (n: number) => `${n} / 9`,
    scatterAutoBtn: 'Automatique',
    scatterValidate: 'Valider',
    scatterMin: (n: number) => `Encore ${n} photo${n > 1 ? 's' : ''} à choisir`,
    scatterMax: '9 photos au plus',
    commentSizeLabel: 'Taille des commentaires',
    commentSizes: { normal: 'Normale', large: 'Grande', xlarge: 'Très grande' },
    photoMapsLabel: 'Cartes à côté des photos',
    photoMapsHint:
      'D’office, une carte à chaque changement de lieu. Ajoutez ou retirez-en avec « Choisir », ou dans l’éditeur de commentaire d’une photo.',
    photoMapsPick: 'Photos avec carte',
    photoMapsChosen: (n: number) => `${n} carte${n > 1 ? 's' : ''} dans l’album`,
    photoMapsPickHint:
      'Touchez une photo pour ajouter ou retirer sa carte. « Automatique » remet une carte à chaque changement de lieu.',
    photoMapsNoName: 'Lieu sans nom',
    photoMapsOffline:
      'Cartes simplifiées sur cet appareil (cartes Apple Plans sur iPhone uniquement).',
    mapLabel: 'Page « Nos lieux de visite »',
    mapHint: (n: number) =>
      `Une page « Nos lieux de visite » après la couverture : ${n} lieu${n > 1 ? 'x' : ''} repéré${n > 1 ? 's' : ''}.`,
    mapNone:
      'Aucune photo de ce dossier n’a de position GPS : la carte ne peut pas être dessinée.',
    coverFallback: (n: number) =>
      `Ce dossier n’a que ${n} photo${n > 1 ? 's' : ''} : la couverture classique sera utilisée.`,
    dateFormats: {
      dayMonth: 'Jour et mois',
      short: 'Simple',
      shortTime: 'Simple + heure',
      long: 'Détaillée',
      full: 'Complète',
      none: 'Aucune',
    },
    dateHints: {
      dayMonth: '8 juillet',
      short: '08/07/2026',
      shortTime: '08/07/2026 à 19h37',
      long: 'mercredi 8 juillet 2026',
      full: '… à 19h37',
      none: 'sans date',
    },
  },
  backup: {
    confirmTitle: 'Sauvegarder tous les dossiers ?',
    confirmBody: (albums: number, photos: number) =>
      `${albums} dossier${albums > 1 ? 's' : ''} et ${photos} photo${photos > 1 ? 's' : ''} seront réunis dans un seul fichier, à enregistrer ensuite dans vos fichiers, un stockage en ligne ou un mail.

La préparation peut prendre un moment et ne peut pas être interrompue.`,
    confirm: 'Sauvegarder',
    building: 'Préparation de la sauvegarde…',
    restoring: 'Restauration en cours…',
    fileBase: 'ComClic sauvegarde',
    howToLink: 'Comment restaurer une sauvegarde ?',
    howToTitle: 'Restaurer une sauvegarde',
    howToBody:
      '1. Touchez « Importer un album ComClic ».\n' +
      '2. Dans Fichiers, ouvrez l’endroit où vous aviez déposé la sauvegarde (iCloud Drive, Sur mon iPhone…) et choisissez le fichier « ComClic sauvegarde » suivi de sa date. Reçue par mail : enregistrez d’abord la pièce jointe dans Fichiers.\n' +
      '3. ComClic annonce le nombre de dossiers et de photos qu’elle contient : confirmez.\n\n' +
      'Les dossiers restaurés s’ajoutent à ceux déjà présents : rien n’est effacé ni remplacé. La langue et les réglages de mise en page sont aussi rétablis.',
    shareTitle: 'Sauvegarde ComClic',
    emptyTitle: 'Rien à sauvegarder',
    emptyBody: 'Créez au moins un dossier avant de lancer une sauvegarde.',
    tooLargeTitle: 'Sauvegarde trop volumineuse',
    tooLargeBody: (n: number) =>
      `Cette version sauvegarde jusqu'à 200 photos en un seul fichier, et vous en avez ${n}. Envoyez d'abord quelques dossiers en « Album ComClic » pour alléger l'app.`,
    failTitle: 'Sauvegarde impossible',
    failBody:
      "Le fichier n'a pas pu être écrit. Vérifiez l'espace libre sur le téléphone, puis réessayez.",
    restoreTitle: 'Restaurer cette sauvegarde ?',
    restoreBody: (albums: number, photos: number, date: string) =>
      `Sauvegarde du ${date} : ${albums} dossier${albums > 1 ? 's' : ''}, ${photos} photo${photos > 1 ? 's' : ''}.

Les dossiers seront AJOUTÉS à ceux déjà présents : rien n'est remplacé. Un nom déjà utilisé donnera un dossier en double.`,
    restoreConfirm: 'Restaurer',
    doneTitle: 'Restauration terminée',
    doneBody: (albums: number, photos: number) =>
      `${albums} dossier${albums > 1 ? 's' : ''} et ${photos} photo${photos > 1 ? 's' : ''} restaurés. Vos réglages sont revenus ; le tri de la liste s'appliquera au prochain lancement.`,
  },
  home: {
    kicker: 'ALBUM PHOTO',
    brand: 'ALBUM PHOTO COMCLIC',
    title: 'Mes dossiers',
    folderCount: (n: number) => `${n} dossier${n > 1 ? 's' : ''}`,
    emptyTitle: 'Aucun dossier',
    emptyText:
      'Crée un dossier pour classer tes photos, puis exporte chaque dossier en PDF à imprimer.',
    searchPlaceholder: 'Rechercher un dossier…',
    foundCount: (n: number) =>
      n === 0 ? 'Aucun résultat' : `${n} dossier${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`,
    sorts: { recent: 'Récents', name: 'Nom A→Z', size: 'Taille de fichier' },
    noMatchTitle: 'Aucun dossier trouvé',
    noMatchText: 'Essayez un autre mot : la recherche porte sur le nom du dossier.',
    newFolder: '＋  Nouveau dossier',
    importAlbum: 'Importer un album ComClic',
    backupAll: 'Sauvegarder tout',
    createTitle: 'Nouveau dossier',
    createSubmit: 'Créer',
    renameTitle: 'Renommer le dossier',
    renameSubmit: 'Renommer',
    duplicating: 'Duplication du dossier…',
  },
  albumScreen: {
    importing: 'Veuillez patienter pendant l’importation de vos photos',
    importProgress: (done: number, total: number) => `${done} / ${total}`,
    back: 'Dossiers',
    newPhoto: '＋  Nouvelle photo',
    gallery: '🖼  Galerie photos',
    textPage: '＋ Page de texte',
    reorderHint: 'Utilisez ▲▼ pour réordonner, ou ⇅ pour déplacer une photo d’un coup',
    move: 'Déplacer',
    moveHint: 'Touchez « Placer ici » à l’endroit voulu',
    moveHere: (n: number) => `Placer ici · position ${n}`,
    movingPhoto: 'Déplacement de cette photo',
    movingText: 'Déplacement de cette page de texte',
    moveBanner: 'Faites défiler, puis touchez « Placer ici ».',
    emptyTitle: 'Aucune photo',
    emptyText:
      'Prenez une photo ou importez-en une depuis votre galerie photo de votre portable, puis ajoutez un commentaire si vous le souhaitez.',
    modeLabel: 'CRÉEZ VOTRE ALBUM EN MODE',
    private: 'Loisir',
    or: 'ou',
    professional: 'Professionnel',
    sendLabelPro: 'Envoyer',
    sendLabelFamily: "Partager l'album",
    defaultTitle: 'Mon album',
  },
  format: {
    title: 'Envoyer le mini album',
    subtitle: 'Choisis le format',
    pdf: 'PDF',
    albumImages: "Images de l'album",
    reusablePhotos: 'Photos (à réutiliser)',
    comclicAlbum: 'Album ComClic (pour un contact)',
  },
  alert: {
    deleteAlbumTitle: (name: string) => `Supprimer « ${name} » ?`,
    deleteAlbumBody:
      'Les photos de ce dossier seront retirées de l’app (mais pas de votre photothèque).',
    savePhotoFail: "Impossible d'enregistrer la photo.",
    permTitle: 'Permission requise',
    permCameraBody:
      "Autorise l'accès à l'appareil photo dans les réglages pour prendre des photos.",
    permLibraryBody:
      "Autorise l'accès à la galerie dans les réglages pour importer des photos.",
    shareUnreadTitle: 'Partage illisible',
    shareUnreadBody: (kind: string, n: number) =>
      `ComClic n’a pas pu lire ce qui a été partagé (type ${kind}, ${n} fichier${n > 1 ? 's' : ''}). Essaie « ＋ Nouvelle photo » ou l’import depuis la galerie.`,
    photoNotAddedTitle: 'Photo non ajoutée à Photos',
    photoNotAddedBody:
      "La photo est bien dans l'album, mais autorise l'ajout à la photothèque dans les réglages pour la conserver aussi dans Photos.",
    saveCropFail: "Impossible d'enregistrer le recadrage.",
    applyAdjustFail: "Impossible d'appliquer les réglages.",
    deletePhotoTitle: 'Supprimer cette photo ?',
    previewFail: "La préparation de l'aperçu a échoué.",
    pdfFail: 'La génération du PDF a échoué.',
    imagesFail: 'La génération des images a échoué.',
    noPhotoTitle: 'Aucune photo',
    noPhotoBody: "Cet album ne contient pas de photo à envoyer.",
    photosPrepFail: 'La préparation des photos a échoué.',
    duplicateAlbumTitle: (name: string) => `Dupliquer « ${name} » ?`,
    duplicateAlbumBody:
      'Une copie indépendante du dossier et de ses photos sera créée. Modifier ou supprimer la copie ne touche pas à l’original.',
    duplicateFail: 'La duplication du dossier a échoué.',
    importNotBundleTitle: 'Fichier non reconnu',
    importNotBundleBody:
      "Ce fichier n'est pas un album ComClic. Choisissez le fichier .comclic.zip reçu par message, WhatsApp ou mail.",
    importFailBody: "L'ouverture de l'album a échoué.",
    textPageTitle: 'Nouvelle page de texte',
    textPageBody: 'Où placer cette page dans le dossier ?',
    textPageAtStart: 'Au début',
    textPageAtEnd: 'À la fin',
  },
  invite: {
    title: 'Votre destinataire a-t-il ComClic ?',
    body:
      'S’il ne l’a pas encore, envoyez-lui le lien d’installation : il en aura besoin pour ouvrir l’album.',
    already: 'Il l’a déjà',
    send: 'Envoyer le lien',
    /** Message texte envoyé au contact (SMS, WhatsApp, Mail…). */
    message: (url: string) =>
      `Je vous envoie un album photo réalisé avec ComClic. Installez l’app pour l’ouvrir : ${url}`,
    fail: 'Le partage du lien a échoué.',
  },
  shareImport: {
    title: (n: number) => `Importer ${n} photo${n > 1 ? 's' : ''} dans…`,
    hint: 'Choisis le dossier de destination',
    newFolder: '＋  Nouveau dossier',
    opening: "Ouverture de l'album reçu…",
  },
  doc: {
    imageUnavailable: 'Image indisponible',
    photoNo: (n: number) => `Photo n° ${n}`,
    place: 'Lieu',
    date: 'Date',
    description: 'Description',
    establishedOn: 'Établi le',
    photoCountLabel: 'Nombre de photos',
    comment: 'Commentaire',
    textPageMarker: '— Page de texte —',
    contextFile: 'contexte.txt',
    mapTitle: 'Nos lieux de visite',
    mapCredit: 'Fond de carte : Natural Earth',
    and: 'et',
  },
};

const en: Dict = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    close: 'Close',
    send: 'Send',
    share: 'Share',
    back: 'Back',
    error: 'Error',
    ok: 'OK',
    duplicate: 'Duplicate',
    later: 'Later',
  },
  welcome: {
    kicker: 'Comment on your photos, save them or share them',
    start: 'Get started',
  },
  album: {
    noName: 'Untitled',
    photoCount: (n: number) => `${n} photo${n > 1 ? 's' : ''}`,
    createdOn: (date: string) => `Created on ${date}`,
    copyName: (name: string) => `${name} (copy)`,
  },
  photoCard: {
    tapWriteText: 'Tap to write this page’s text',
    tapAddComment: 'Tap to add a caption',
    textPage: 'TEXT PAGE',
    edit: 'Edit',
  },
  nameModal: {
    lineHint: 'Return key: move the end of the name to a new line (2 lines at most).',
    folderPlaceholder: 'Folder name',
  },
  comment: {
    textLabel: 'Page text',
    commentLabel: 'Caption',
    textPlaceholder: 'Write this page’s text…',
    commentPlaceholder: 'Say something about this moment…',
    placeLabel: 'Location',
    placePlaceholder: 'Where it was taken…',
    mapLabel: 'Map of the place next to the photo',
    mapAutoOn: 'Suggested: the place differs from the previous photo.',
    mapAutoOff: 'Not suggested: same place as the previous photo.',
    mapNeedsOption: 'Shown when “Maps next to photos” is on in the Leisure layout.',
    checkButton: '✓ Check spelling & grammar',
    boldLabel: 'Bold',
    underlineLabel: 'Underline',
    formatSelection: 'applies to the selected text',
    formatAll: 'applies to the whole caption',
    tapToEdit: 'Tap to edit',
    spellTitle: 'Spelling',
    spellNone: 'No mistakes found.',
    spellUnavailableTitle: 'Checker unavailable',
    spellUnavailableBody: 'The check could not complete. Try again.',
    dictate: 'Dictate',
    listening: 'Listening…',
    micDeniedTitle: 'Microphone not allowed',
    micDeniedBody:
      'Allow the microphone and speech recognition in Settings to dictate your captions.',
    micFailedTitle: 'Dictation unavailable',
    micFailedBody:
      'On-device speech recognition did not start. Check that dictation is enabled in Settings → General → Keyboard, with the app language installed.',
  },
  version: {
    embedded: 'built-in version',
    update: 'upd',
    updating: 'Updating the app…',
  },
  spell: {
    progress: (i: number, n: number) => `Mistake ${i} of ${n}`,
    replaceWith: 'Replace with:',
    noSuggestion: 'No suggestion available.',
    ignore: 'Ignore',
  },
  adjust: {
    title: 'Adjustments',
    rotate: '⟳  Rotate 90°',
    reset: 'Reset',
    exposure: 'Exposure',
    brightness: 'Brightness',
    contrast: 'Contrast',
    saturation: 'Saturation',
    warmth: 'Warmth',
  },
  camera: {
    take: 'Take photo',
    flip: 'Flip',
    zoom: 'Zoom',
    flash: { auto: 'Flash auto', on: 'Flash on', off: 'Flash off' },
  },
  paywall: {
    title: 'Upgrade to ComClic',
    titleUpgrade: 'Upgrade to the full version',
    leadMenu: 'One payment, no subscription, to enjoy ComClic without limits.',
    leadQuota: (n: number) =>
      `You have shared your ${n} trial albums. Choose your version to continue.`,
    leadTooManyPhotos: (n: number) =>
      `The trial shares albums of up to ${n} photos. Choose your version to share this one.`,
    leadFeature: 'This feature is part of the full version.',
    leadUpgrade: 'Unlock every ComClic feature.',
    trialStatus: (used: number, max: number, photos: number) =>
      `Trial: ${used} of ${max} album${max > 1 ? 's' : ''} shared, up to ${photos} photos per album`,
    recommended: 'RECOMMENDED',
    lightFeatures: [
      'Unlimited albums, no photo limit',
      'PDF, album images, sending to ComClic friends',
      '18 background colors, captions, dictation, spell check',
    ],
    fullIntro: 'Everything in ComClic Light, plus:',
    fullFeatures: [
      'Professional report',
      'Backup and restore of all your folders',
      '16 × 21 and 16 × 16 cm formats',
      'Scattered and grid covers',
      'Place maps',
      'Classic and Handwritten typography',
      'Marker annotation on photos',
    ],
    buyLight: (price: string) => `Buy the Light version · ${price}`,
    buyFull: (price: string) => `Buy the full version · ${price}`,
    buyUpgrade: (price: string) => `Upgrade to the full version · ${price}`,
    oneTime: 'One-time payment, no subscription. Linked to your App Store or Google Play account.',
    restore: 'Restore purchases',
    thanksTitle: 'Thank you!',
    thanksBody: (full: boolean) =>
      full ? 'Every ComClic feature is unlocked.' : 'ComClic Light is unlocked: unlimited albums.',
    restoredTitle: 'Purchases restored',
    restoredBody: (full: boolean) =>
      full ? 'Your full version is active again.' : 'Your Light version is active again.',
    restoredNone: 'No purchase was found for this account.',
    errorTitle: 'Purchase failed',
    errorBody: 'The store could not process the request. Check your connection, then try again.',
    lockedTitle: 'Full version',
    lockedBody: 'This feature is part of the full version of ComClic.',
    lockedSee: 'Learn more',
    statusTrial: (left: number) =>
      `Trial · ${left} album${left > 1 ? 's' : ''} left to share · Unlock`,
    statusLight: 'ComClic Light · Upgrade to the full version',
    restoreFullOnly: 'Restoring a backup is part of the full version.',
  },
  annotate: {
    title: 'Annotate',
    free: 'Freehand',
    arrow: 'Arrow',
    undo: 'Undo stroke',
    clear: 'Clear all',
    widths: { thin: 'Thin stroke', medium: 'Medium stroke', thick: 'Thick stroke' },
    saveFail: 'The annotations could not be saved.',
    cropTitle: 'Crop the photo?',
    cropBody: 'Cropping removes the annotations from this photo.',
    cropContinue: 'Crop',
    droppedTitle: 'Annotations removed',
    droppedRotate: 'The photo was rotated: its annotations no longer lined up.',
  },
  viewer: {
    open: 'View photo full screen',
    hint: 'Pinch to zoom',
  },
  crop: {
    title: 'Crop',
    format: 'Format',
    hPosition: 'Horizontal position',
    vPosition: 'Vertical position',
    left: 'Left',
    center: 'Center',
    right: 'Right',
    top: 'Top',
    bottom: 'Bottom',
    apply: 'Apply',
    ratioOriginal: 'Original',
    ratioSquare: 'Square',
    failed: 'Cropping failed.',
  },
  preview: {
    editAlbum: '‹ Edit album',
    title: 'Preview before sending',
    subtitle: 'Scroll to check each page',
    subtitleEditable: 'Tap a photo or a text page to adjust it (size, position, background)',
    subtitleEditablePro: 'Tap an entry to change its size, or a text page to place its text',
    resetSizePro: (size: string) => `Back to the report size (${size})`,
    textPos: 'Text position on the page',
    resetTextPos: (pos: string) => `Back to the default position (${pos})`,
    textPosIsDefault: 'Using the default position.',
    sizeIsDefaultPro: 'Using the report size.',
    entrySize: 'This photo’s size',
    resetSize: (size: string) => `Back to the album size (${size})`,
    sizeIsAlbum: 'Using the album size.',
    entryBg: 'This page’s background',
    resetBg: 'Back to the album background',
    bgIsAlbum: 'Using the album background.',
    textPage: 'Text page',
    done: 'OK',
    layout: 'Layout',
    photoProgress: (done: number, total: number) => `Photos ${done}/${total}…`,
  },
  export: {
    title: 'Layout',
    sections: { style: 'Style', photos: 'Photos', texts: 'Text', maps: 'Maps' },
    sumLiseret: 'Border',
    sumPlace: 'Place',
    sumComment: (size: string) => `${size} captions`,
    sumDate: (format: string) => `Date: ${format.toLowerCase()}`,
    sumNoDate: 'No date',
    sumProText: (size: string) => `${size} text`,
    proTextSizeLabel: 'Text size',
    proSizeHints: { small: '2 side by side', medium: '2 per page', large: '1 per page' },
    proSizeNote: 'A single photo can also be enlarged or shrunk in the preview.',
    proTextBoldLabel: 'Bold text',
    sumBold: 'bold',
    sumNoMaps: 'No maps next to photos',
    sumMapPage: '“Places we visited” page',
    sumNoPlaces: 'No geotagged photos',
    sizeLabel: 'Photo size',
    bgLabel: 'Album background color',
    bgHint: 'The color of each page can be changed later in the preview.',
    formatLabel: 'Album format',
    coverTitleLabel: 'Cover title',
    coverTitleHint:
      'The folder name by default. Start a new line to break the title where you want (3 lines at most).',
    formats: { a4: 'A4', '16x21': '16 × 21 cm', '16x16': '16 × 16 cm' },
    formatHints: { a4: '21 × 29.7 cm', '16x21': 'photo book', '16x16': 'square' },
    bgGroups: { light: 'Light', natural: 'Natural', deep: 'Deep' },
    frameLabel: 'Framing',
    liseretLabel: 'Border around the photo',
    placeLabel: 'Place the photo was taken',
    dateLabel: 'Date under photos',
    datePosLabel: 'Date position',
    textAlignLabel: 'Text alignment (captions and text pages)',
    textAlignProLabel: 'Text page alignment',
    commentPosLabel: 'Vertical position of the caption',
    previewBtn: 'Preview',
    yes: 'Yes',
    no: 'No',
    sizes: { small: 'Small', medium: 'Medium', large: 'Large', full: 'Full page' },
    sizeHints: {
      small: '4 / page',
      medium: '2 / page',
      large: '1 / page',
      full: 'edge to edge',
    },
    frames: { card: 'Card', border: 'Border', polaroid: 'Polaroid', none: 'No frame' },
    aligns: { left: 'Left', center: 'Center', right: 'Right' },
    commentPos: { top: 'Top', middle: 'Middle', bottom: 'Bottom' },
    typefaceLabel: 'Typography',
    typefaces: { sans: 'Modern', serif: 'Classic', script: 'Handwritten' },
    typefaceSample: 'Our memories',
    coverLabel: 'Cover',
    covers: { classic: 'Classic', scatter: 'Scattered', filmstrip: 'Grid' },
    coverHints: { classic: '1 photo', scatter: '3 to 9 photos', filmstrip: '4 to 9 photos' },
    scatterPhotosLabel: 'Scattered cover photos',
    scatterAuto: 'Automatic: the ★ photo, then the next ones',
    scatterChosen: (n: number) => `${n} photos chosen`,
    scatterChoose: 'Choose',
    scatterPickHint: 'Tap 3 to 9 photos. The first one goes in the centre, larger.',
    scatterCount: (n: number) => `${n} / 9`,
    scatterAutoBtn: 'Automatic',
    scatterValidate: 'Done',
    scatterMin: (n: number) => `${n} more photo${n > 1 ? 's' : ''} to choose`,
    scatterMax: '9 photos at most',
    commentSizeLabel: 'Caption size',
    commentSizes: { normal: 'Normal', large: 'Large', xlarge: 'Extra large' },
    photoMapsLabel: 'Maps next to photos',
    photoMapsHint:
      'By default, one map each time the place changes. Add or remove maps with “Choose”, or in a photo’s comment editor.',
    photoMapsPick: 'Photos with a map',
    photoMapsChosen: (n: number) => `${n} map${n > 1 ? 's' : ''} in the album`,
    photoMapsPickHint:
      'Tap a photo to add or remove its map. “Automatic” puts back one map each time the place changes.',
    photoMapsNoName: 'Unnamed place',
    photoMapsOffline: 'Simplified maps on this device (Apple Maps on iPhone only).',
    mapLabel: '“Places we visited” page',
    mapHint: (n: number) =>
      `A “Places we visited” page after the cover: ${n} place${n > 1 ? 's' : ''} found.`,
    mapNone: 'No photo in this folder has a GPS position: the map cannot be drawn.',
    coverFallback: (n: number) =>
      `This folder has only ${n} photo${n > 1 ? 's' : ''}: the classic cover will be used.`,
    dateFormats: {
      dayMonth: 'Day and month',
      short: 'Simple',
      shortTime: 'Simple + time',
      long: 'Detailed',
      full: 'Full',
      none: 'None',
    },
    dateHints: {
      dayMonth: 'July 8',
      short: '7/8/2026',
      shortTime: '7/8/2026 at 7:37 PM',
      long: 'Wednesday, July 8, 2026',
      full: '… at 7:37 PM',
      none: 'no date',
    },
  },
  backup: {
    confirmTitle: 'Back up all folders?',
    confirmBody: (albums: number, photos: number) =>
      `${albums} folder${albums > 1 ? 's' : ''} and ${photos} photo${photos > 1 ? 's' : ''} will be gathered into a single file, to save afterwards in your files, online storage or an email.

Preparing it may take a while and cannot be interrupted.`,
    confirm: 'Back up',
    building: 'Preparing backup…',
    restoring: 'Restoring…',
    fileBase: 'ComClic backup',
    howToLink: 'How do I restore a backup?',
    howToTitle: 'Restore a backup',
    howToBody:
      '1. Tap “Import ComClic File”.\n' +
      '2. In Files, open the place where you saved the backup (iCloud Drive, On My iPhone…) and pick the “ComClic backup” file followed by its date. Received by email? Save the attachment to Files first.\n' +
      '3. ComClic shows how many folders and photos it contains: confirm.\n\n' +
      'Restored folders are added to the ones already in the app: nothing is deleted or replaced. Your language and layout settings are restored too.',
    shareTitle: 'ComClic backup',
    emptyTitle: 'Nothing to back up',
    emptyBody: 'Create at least one folder before running a backup.',
    tooLargeTitle: 'Backup too large',
    tooLargeBody: (n: number) =>
      `This version backs up to 200 photos in a single file, and you have ${n}. Send a few folders as a ComClic Album first to lighten the app.`,
    failTitle: 'Backup failed',
    failBody:
      'The file could not be written. Check the free space on your phone, then try again.',
    restoreTitle: 'Restore this backup?',
    restoreBody: (albums: number, photos: number, date: string) =>
      `Backup from ${date}: ${albums} folder${albums > 1 ? 's' : ''}, ${photos} photo${photos > 1 ? 's' : ''}.

Folders will be ADDED to the ones already there: nothing is replaced. A name already in use creates a duplicate folder.`,
    restoreConfirm: 'Restore',
    doneTitle: 'Restore complete',
    doneBody: (albums: number, photos: number) =>
      `${albums} folder${albums > 1 ? 's' : ''} and ${photos} photo${photos > 1 ? 's' : ''} restored. Your settings are back; the list sorting applies at next launch.`,
  },
  home: {
    kicker: 'PHOTO ALBUM',
    brand: 'COMCLIC PHOTO ALBUM',
    title: 'My folders',
    folderCount: (n: number) => `${n} folder${n > 1 ? 's' : ''}`,
    emptyTitle: 'No folder',
    emptyText:
      'Create a folder to sort your photos, then export each folder as a printable PDF.',
    searchPlaceholder: 'Search a folder…',
    foundCount: (n: number) =>
      n === 0 ? 'No result' : `${n} folder${n > 1 ? 's' : ''} found`,
    sorts: { recent: 'Recent', name: 'Name A→Z', size: 'File size' },
    noMatchTitle: 'No folder found',
    noMatchText: 'Try another word: the search looks at folder names.',
    newFolder: '＋  New folder',
    importAlbum: 'Import ComClic File',
    backupAll: 'Full Backup',
    createTitle: 'New folder',
    createSubmit: 'Create',
    renameTitle: 'Rename folder',
    renameSubmit: 'Rename',
    duplicating: 'Duplicating folder…',
  },
  albumScreen: {
    importing: 'Please wait while your photos are being imported',
    importProgress: (done: number, total: number) => `${done} / ${total}`,
    back: 'Folders',
    newPhoto: '＋  New photo',
    gallery: '🖼  Photo gallery',
    textPage: '＋ Text page',
    reorderHint: 'Use ▲▼ to reorder, or ⇅ to move a photo in one go',
    move: 'Move',
    moveHint: 'Tap “Place here” where you want it',
    moveHere: (n: number) => `Place here · position ${n}`,
    movingPhoto: 'Moving this photo',
    movingText: 'Moving this text page',
    moveBanner: 'Scroll, then tap “Place here”.',
    emptyTitle: 'No photo',
    emptyText:
      'Take a photo or import one from your phone’s gallery, then add a caption if you like.',
    modeLabel: 'CREATE YOUR ALBUM IN MODE',
    private: 'Leisure',
    or: 'or',
    professional: 'Professional',
    sendLabelPro: 'Send',
    sendLabelFamily: 'Share album',
    defaultTitle: 'My album',
  },
  format: {
    title: 'Send the mini album',
    subtitle: 'Choose the format',
    pdf: 'PDF',
    albumImages: 'Album images',
    reusablePhotos: 'Photos (reusable)',
    comclicAlbum: 'ComClic album (for a contact)',
  },
  alert: {
    deleteAlbumTitle: (name: string) => `Delete “${name}”?`,
    deleteAlbumBody:
      'The photos in this folder will be removed from the app (but not from your photo library).',
    savePhotoFail: 'Could not save the photo.',
    permTitle: 'Permission required',
    permCameraBody:
      'Allow camera access in Settings to take photos.',
    permLibraryBody:
      'Allow gallery access in Settings to import photos.',
    shareUnreadTitle: 'Nothing readable shared',
    shareUnreadBody: (kind: string, n: number) =>
      `ComClic could not read what was shared (type ${kind}, ${n} file${n > 1 ? 's' : ''}). Try “＋ New photo” or importing from the library.`,
    photoNotAddedTitle: 'Photo not added to Photos',
    photoNotAddedBody:
      'The photo is in the album, but allow adding to the photo library in Settings to keep it in Photos too.',
    saveCropFail: 'Could not save the crop.',
    applyAdjustFail: 'Could not apply the adjustments.',
    deletePhotoTitle: 'Delete this photo?',
    previewFail: 'Preview preparation failed.',
    pdfFail: 'PDF generation failed.',
    imagesFail: 'Image generation failed.',
    noPhotoTitle: 'No photo',
    noPhotoBody: 'This album has no photo to send.',
    photosPrepFail: 'Preparing the photos failed.',
    duplicateAlbumTitle: (name: string) => `Duplicate “${name}”?`,
    duplicateAlbumBody:
      'An independent copy of the folder and its photos will be created. Editing or deleting the copy leaves the original untouched.',
    duplicateFail: 'Duplicating the folder failed.',
    importNotBundleTitle: 'File not recognised',
    importNotBundleBody:
      'This file is not a ComClic album. Pick the .comclic.zip file received by message, WhatsApp or email.',
    importFailBody: 'Opening the album failed.',
    textPageTitle: 'New text page',
    textPageBody: 'Where should this page go in the folder?',
    textPageAtStart: 'At the beginning',
    textPageAtEnd: 'At the end',
  },
  invite: {
    title: 'Does your recipient have ComClic?',
    body:
      'If not yet, send them the install link: they will need the app to open the album.',
    already: 'They already have it',
    send: 'Send the link',
    message: (url: string) =>
      `I’m sending you a photo album made with ComClic. Install the app to open it: ${url}`,
    fail: 'Sharing the link failed.',
  },
  shareImport: {
    title: (n: number) => `Import ${n} photo${n > 1 ? 's' : ''} into…`,
    hint: 'Choose the destination folder',
    newFolder: '＋  New folder',
    opening: 'Opening the received album…',
  },
  doc: {
    imageUnavailable: 'Image unavailable',
    photoNo: (n: number) => `Photo no. ${n}`,
    place: 'Location',
    date: 'Date',
    description: 'Description',
    establishedOn: 'Prepared on',
    photoCountLabel: 'Number of photos',
    comment: 'Comment',
    textPageMarker: '— Text page —',
    contextFile: 'context.txt',
    mapTitle: 'Places we visited',
    mapCredit: 'Base map: Natural Earth',
    and: 'and',
  },
};

const DICT: Record<Lang, Dict> = { fr, en };

/** Dictionnaire d'une langue (usage hors React). */
export function dict(lang: Lang): Dict {
  return DICT[lang] ?? DICT[DEFAULT_LANG];
}

export interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  L: Dict;
}

export const LangContext = createContext<LangContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  L: DICT[DEFAULT_LANG],
});

/** Hook principal : langue courante, sélecteur, et dictionnaire `L`. */
export function useLang(): LangContextValue {
  return useContext(LangContext);
}

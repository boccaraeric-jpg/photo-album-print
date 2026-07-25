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
  },
  welcome: {
    kicker: 'Commentez vos photos, sauvegardez ou partagez-les',
    start: 'Commencer',
  },
  album: {
    noName: 'Sans nom',
    photoCount: (n: number) => `${n} photo${n > 1 ? 's' : ''}`,
    createdOn: (date: string) => `Créé le ${date}`,
  },
  photoCard: {
    tapWriteText: 'Toucher pour écrire le texte de la page',
    tapAddComment: 'Toucher pour ajouter un commentaire',
    textPage: 'PAGE DE TEXTE',
    edit: 'Modifier',
  },
  nameModal: {
    folderPlaceholder: 'Nom du dossier',
  },
  comment: {
    textLabel: 'Texte de la page',
    commentLabel: 'Commentaire',
    textPlaceholder: 'Écrivez le texte de cette page…',
    commentPlaceholder: 'Commentez ce moment…',
    placeLabel: 'Lieu',
    placePlaceholder: 'Lieu de la prise de vue…',
    checkButton: '✓ Vérifier orthographe & grammaire',
    spellTitle: 'Orthographe',
    spellNone: 'Aucune faute détectée.',
    spellUnavailableTitle: 'Correcteur indisponible',
    spellUnavailableBody: "La vérification n'a pas pu aboutir. Réessaie.",
    dictate: 'Dicter',
    listening: 'À l’écoute…',
    micDeniedTitle: 'Micro non autorisé',
    micDeniedBody:
      'Autorise le micro et la reconnaissance vocale dans les réglages pour dicter tes commentaires.',
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
    layout: 'Mise en page',
  },
  export: {
    title: 'Mise en page',
    proNote:
      'Mise en page sobre imposée : fond blanc, photos numérotées, avec date/heure, lieu et description sous chacune.',
    sizeLabel: 'Taille des photos',
    bgLabel: 'Couleur du fond',
    frameLabel: 'Encadrement',
    liseretLabel: 'Liseré autour de la photo',
    dateLabel: 'Date sous les photos',
    datePosLabel: 'Position de la date',
    textAlignLabel: 'Alignement du texte (pages de texte)',
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
    dateFormats: {
      short: 'Simple',
      shortTime: 'Simple + heure',
      long: 'Détaillée',
      full: 'Complète',
      none: 'Aucune',
    },
    dateHints: {
      short: '08/07/2026',
      shortTime: '08/07/2026 à 19h37',
      long: 'mercredi 8 juillet 2026',
      full: '… à 19h37',
      none: 'sans date',
    },
  },
  home: {
    kicker: 'ALBUM PHOTO',
    title: 'Mes dossiers',
    folderCount: (n: number) => `${n} dossier${n > 1 ? 's' : ''}`,
    emptyTitle: 'Aucun dossier',
    emptyText:
      'Crée un dossier pour classer tes photos, puis exporte chaque dossier en PDF à imprimer.',
    newFolder: '＋  Nouveau dossier',
    createTitle: 'Nouveau dossier',
    createSubmit: 'Créer',
    renameTitle: 'Renommer le dossier',
    renameSubmit: 'Renommer',
  },
  albumScreen: {
    back: 'Dossiers',
    newPhoto: '＋  Nouvelle photo',
    gallery: '🖼  Galerie photos',
    textPage: '＋ Page de texte',
    reorderHint: 'Utilisez ▲▼ pour réordonner les photos',
    emptyTitle: 'Aucune photo',
    emptyText:
      'Prenez une photo ou importez-en une depuis votre galerie photo de votre portable, puis ajoutez un commentaire si vous le souhaitez.',
    modeLabel: 'CRÉEZ VOTRE ALBUM EN MODE',
    private: 'Privé',
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
  },
  welcome: {
    kicker: 'Comment on your photos, save them or share them',
    start: 'Get started',
  },
  album: {
    noName: 'Untitled',
    photoCount: (n: number) => `${n} photo${n > 1 ? 's' : ''}`,
    createdOn: (date: string) => `Created on ${date}`,
  },
  photoCard: {
    tapWriteText: 'Tap to write this page’s text',
    tapAddComment: 'Tap to add a caption',
    textPage: 'TEXT PAGE',
    edit: 'Edit',
  },
  nameModal: {
    folderPlaceholder: 'Folder name',
  },
  comment: {
    textLabel: 'Page text',
    commentLabel: 'Caption',
    textPlaceholder: 'Write this page’s text…',
    commentPlaceholder: 'Say something about this moment…',
    placeLabel: 'Location',
    placePlaceholder: 'Where it was taken…',
    checkButton: '✓ Check spelling & grammar',
    spellTitle: 'Spelling',
    spellNone: 'No mistakes found.',
    spellUnavailableTitle: 'Checker unavailable',
    spellUnavailableBody: 'The check could not complete. Try again.',
    dictate: 'Dictate',
    listening: 'Listening…',
    micDeniedTitle: 'Microphone not allowed',
    micDeniedBody:
      'Allow the microphone and speech recognition in Settings to dictate your captions.',
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
    layout: 'Layout',
  },
  export: {
    title: 'Layout',
    proNote:
      'Clean fixed layout: white background, numbered photos, with date/time, location and description under each.',
    sizeLabel: 'Photo size',
    bgLabel: 'Background color',
    frameLabel: 'Framing',
    liseretLabel: 'Border around the photo',
    dateLabel: 'Date under photos',
    datePosLabel: 'Date position',
    textAlignLabel: 'Text alignment (text pages)',
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
    dateFormats: {
      short: 'Simple',
      shortTime: 'Simple + time',
      long: 'Detailed',
      full: 'Full',
      none: 'None',
    },
    dateHints: {
      short: '7/8/2026',
      shortTime: '7/8/2026 at 7:37 PM',
      long: 'Wednesday, July 8, 2026',
      full: '… at 7:37 PM',
      none: 'no date',
    },
  },
  home: {
    kicker: 'PHOTO ALBUM',
    title: 'My folders',
    folderCount: (n: number) => `${n} folder${n > 1 ? 's' : ''}`,
    emptyTitle: 'No folder',
    emptyText:
      'Create a folder to sort your photos, then export each folder as a printable PDF.',
    newFolder: '＋  New folder',
    createTitle: 'New folder',
    createSubmit: 'Create',
    renameTitle: 'Rename folder',
    renameSubmit: 'Rename',
  },
  albumScreen: {
    back: 'Folders',
    newPhoto: '＋  New photo',
    gallery: '🖼  Photo gallery',
    textPage: '＋ Text page',
    reorderHint: 'Use ▲▼ to reorder the photos',
    emptyTitle: 'No photo',
    emptyText:
      'Take a photo or import one from your phone’s gallery, then add a caption if you like.',
    modeLabel: 'CREATE YOUR ALBUM IN MODE',
    private: 'Private',
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

import type { Lang } from './i18n';

/*
 * Textes de l'écran d'aide (`HelpModal`, bouton « ? » de l'accueil et d'un
 * dossier). Tenus à part du dictionnaire `i18n.ts` : ce sont des paragraphes,
 * pas des libellés. Chaque langue doit fournir les mêmes rubriques, dans le
 * même ordre (`HELP_IDS`) — le typage l'impose.
 *
 * À tenir à jour avec l'app : une fonction ajoutée ou déplacée doit y figurer.
 */

/** Rubriques, dans l'ordre d'affichage. */
export const HELP_IDS = [
  'start',
  'folders',
  'add',
  'comment',
  'tools',
  'order',
  'album',
  'layout',
  'send',
  'backup',
  'versions',
  'privacy',
] as const;
export type HelpId = (typeof HELP_IDS)[number];

export interface HelpSection {
  title: string;
  /** Paragraphes ; une ligne commençant par « • » est une puce. */
  body: string[];
}

export interface HelpContent {
  title: string;
  intro: string;
  sections: Record<HelpId, HelpSection>;
}

const fr: HelpContent = {
  title: 'Aide',
  intro:
    'ComClic transforme vos photos commentées en album ou en rapport, prêt à envoyer. Touchez une rubrique pour l’ouvrir.',
  sections: {
    start: {
      title: 'Démarrer en 4 étapes',
      body: [
        '• Créez un dossier avec « ＋ Nouveau dossier ».',
        '• Ajoutez-y des photos : appareil photo ou galerie.',
        '• Touchez une photo pour écrire ou dicter son commentaire.',
        '• Choisissez « Loisir » ou « Professionnel » en bas de l’écran, réglez la mise en page, vérifiez l’aperçu, puis envoyez.',
      ],
    },
    folders: {
      title: 'Mes dossiers',
      body: [
        'Un dossier réunit les photos d’un même album : un voyage, un chantier, une commande.',
        '• Rechercher : tapez quelques lettres dans la barre de recherche.',
        '• Trier : Récents, Nom A→Z ou Taille de fichier.',
        '• Sur chaque dossier, trois boutons : renommer, dupliquer (une copie indépendante), supprimer.',
        '• FR / EN, en haut à droite, change la langue de l’app et des albums.',
      ],
    },
    add: {
      title: 'Ajouter des photos et du texte',
      body: [
        '• « ＋ Nouvelle photo » ouvre l’appareil photo. La photo est aussi enregistrée dans votre photothèque.',
        '• « Galerie photos » importe une ou plusieurs photos existantes.',
        '• « ＋ Page de texte » insère une page de texte seul, au début ou à la fin : une introduction, un titre de chapitre, une conclusion.',
        'Un dossier contient 100 photos au plus. Au-delà, créez un second dossier.',
      ],
    },
    comment: {
      title: 'Commenter une photo',
      body: [
        'Touchez la carte d’une photo pour ouvrir son éditeur.',
        '• Écrivez, ou touchez le micro pour dicter. Dites « point », « virgule », « à la ligne » pour ponctuer.',
        '• B et U mettent en gras ou soulignent le texte sélectionné, ou tout le commentaire si rien n’est sélectionné.',
        '• « Vérifier orthographe & grammaire » relit votre texte en français, sans connexion.',
        '• Le lieu et la date sont repris de la photo quand ils sont connus. Le lieu peut être corrigé à la main.',
        'Pour voir une photo en grand, touchez sa vignette.',
      ],
    },
    tools: {
      title: 'Les boutons d’une photo',
      body: [
        '• Étoile : fait de cette photo la couverture de l’album.',
        '• Recadrer : tirez les coins ou les bords, glissez ou pincez la photo, pivotez-la. « Valider » en haut à droite.',
        '• Réglages : luminosité, contraste, couleurs.',
        '• Pinceau : annotez la photo au marqueur, en tracé libre ou avec une flèche.',
        '• Corbeille : retire la photo du dossier.',
        'Rien n’est définitif : réglages et annotations restent modifiables.',
      ],
    },
    order: {
      title: 'Changer l’ordre des photos',
      body: [
        'L’ordre du dossier est celui de l’album.',
        '• ▲ et ▼ montent ou descendent une photo d’un rang.',
        '• ⇅ déplace une photo loin d’un coup : touchez-le, puis « Placer ici » à l’endroit voulu.',
        '• « Trier par date » range tout le dossier par date de prise de vue. « Annuler le tri » revient à l’ordre précédent.',
      ],
    },
    album: {
      title: 'Loisir ou Professionnel ?',
      body: [
        '• Loisir : un album à feuilleter. Couverture, typographie, couleur de fond, cartes des lieux, formats A4, 16 × 21 ou 16 × 16 cm.',
        '• Professionnel : un rapport photographique. Photos numérotées, lieu, date et heure, description, en-tête de page, table récapitulative, auteur et référence du dossier.',
        'Le même dossier peut sortir dans les deux styles, autant de fois que vous voulez.',
      ],
    },
    layout: {
      title: 'Mise en page et aperçu',
      body: [
        'La mise en page est rangée par rubriques (Style, Photos, Textes, Cartes). Chaque rubrique affiche vos choix en cours ; touchez-la pour les modifier.',
        '« Aperçu » montre l’album page par page, tel qu’il sera envoyé.',
        '• Dans l’aperçu, touchez une photo pour changer sa taille ou le fond de sa page.',
        '• Touchez une page de texte pour la placer en haut, au milieu ou en bas.',
        '• « Modifier l’album » revient à la mise en page.',
      ],
    },
    send: {
      title: 'Envoyer l’album',
      body: [
        'Depuis l’aperçu, choisissez ce que vous envoyez :',
        '• PDF : l’album en un seul fichier, à lire ou à imprimer.',
        '• Images de l’album : une image par page.',
        '• Photos (à réutiliser) : vos photos en pleine qualité, avec un fichier texte des commentaires, lieux et dates.',
        '• Album ComClic : pour un proche qui a l’app. Il reçoit le dossier complet et peut le modifier.',
        'L’envoi passe par la feuille de partage de votre téléphone : Mail, Messages, WhatsApp, AirDrop, Fichiers…',
      ],
    },
    backup: {
      title: 'Sauvegarder, restaurer, recevoir',
      body: [
        '• « Sauvegarder tout » réunit tous vos dossiers et vos réglages dans un seul fichier. Rangez-le hors du téléphone : iCloud Drive, Fichiers, ou envoyez-le-vous par mail.',
        '• Pour restaurer, touchez « Importer un album ComClic » et choisissez ce fichier. Les dossiers s’ajoutent ; rien n’est remplacé ni effacé.',
        '• Le même bouton ouvre un album ComClic reçu d’un proche.',
        'Important : supprimer l’app efface ses dossiers. Seule une sauvegarde permet de les retrouver.',
      ],
    },
    versions: {
      title: 'Essai, Light et version complète',
      body: [
        '• Essai gratuit : 3 albums envoyés, de 15 photos au plus.',
        '• ComClic Light : albums illimités.',
        '• Version complète : rapport professionnel, sauvegarde, annotation, formats 16 × 21 et 16 × 16, couvertures montées, typographies, cartes.',
        'Ce sont des achats uniques, sans abonnement. « Restaurer mes achats » les réactive sur un nouvel appareil.',
      ],
    },
    privacy: {
      title: 'Vos photos restent chez vous',
      body: [
        'ComClic fonctionne sans compte et ne collecte rien. Vos photos et vos textes restent sur votre téléphone ; rien ne part sans que vous l’envoyiez.',
        'Seules exceptions, gérées par votre téléphone : le nom du lieu d’une photo et le fond des cartes, demandés au service de cartes du système.',
      ],
    },
  },
};

const en: HelpContent = {
  title: 'Help',
  intro:
    'ComClic turns your captioned photos into an album or a report, ready to send. Tap a topic to open it.',
  sections: {
    start: {
      title: 'Get started in 4 steps',
      body: [
        '• Create a folder with “＋ New folder”.',
        '• Add photos to it: camera or photo library.',
        '• Tap a photo to type or dictate its caption.',
        '• Choose “Leisure” or “Professional” at the bottom of the screen, set the layout, check the preview, then send.',
      ],
    },
    folders: {
      title: 'My folders',
      body: [
        'A folder holds the photos of one album: a trip, a building site, an order.',
        '• Search: type a few letters in the search bar.',
        '• Sort: Recent, Name A→Z or File size.',
        '• Each folder has three buttons: rename, duplicate (an independent copy), delete.',
        '• FR / EN, top right, sets the language of the app and of the albums.',
      ],
    },
    add: {
      title: 'Adding photos and text',
      body: [
        '• “＋ New photo” opens the camera. The photo is also saved to your photo library.',
        '• “Photo gallery” imports one or several existing photos.',
        '• “＋ Text page” inserts a page of text only, at the start or at the end: an introduction, a chapter title, a conclusion.',
        'A folder holds up to 100 photos. Beyond that, create a second folder.',
      ],
    },
    comment: {
      title: 'Captioning a photo',
      body: [
        'Tap a photo’s card to open its editor.',
        '• Type, or tap the microphone to dictate. Say “period”, “comma”, “new line” for punctuation.',
        '• B and U make the selected text bold or underlined, or the whole caption when nothing is selected.',
        '• Place and date come from the photo when known. The place can be corrected by hand.',
        'To see a photo full screen, tap its thumbnail.',
      ],
    },
    tools: {
      title: 'The buttons on a photo',
      body: [
        '• Star: makes this photo the album cover.',
        '• Crop: drag the corners or edges, move or pinch the photo, rotate it. “Done” is at the top right.',
        '• Adjust: brightness, contrast, colours.',
        '• Brush: mark up the photo, freehand or with an arrow.',
        '• Bin: removes the photo from the folder.',
        'Nothing is final: adjustments and markings can be changed later.',
      ],
    },
    order: {
      title: 'Changing the order of photos',
      body: [
        'The order of the folder is the order of the album.',
        '• ▲ and ▼ move a photo up or down one place.',
        '• ⇅ moves a photo a long way in one go: tap it, then “Place here” where you want it.',
        '• “Sort by date” orders the whole folder by date taken. “Undo sort” brings back the previous order.',
      ],
    },
    album: {
      title: 'Leisure or Professional?',
      body: [
        '• Leisure: an album to leaf through. Cover, typeface, background colour, maps of places, A4, 16 × 21 or 16 × 16 cm formats.',
        '• Professional: a photo report. Numbered photos, place, date and time, description, page header, summary table, author and file reference.',
        'The same folder can be produced in both styles, as often as you like.',
      ],
    },
    layout: {
      title: 'Layout and preview',
      body: [
        'The layout is organised in sections (Style, Photos, Text, Maps). Each section shows your current choices; tap it to change them.',
        '“Preview” shows the album page by page, exactly as it will be sent.',
        '• In the preview, tap a photo to change its size or the background of its page.',
        '• Tap a text page to place it at the top, middle or bottom.',
        '• “Edit album” goes back to the layout.',
      ],
    },
    send: {
      title: 'Sending the album',
      body: [
        'From the preview, choose what to send:',
        '• PDF: the album as a single file, to read or print.',
        '• Album images: one image per page.',
        '• Photos (to reuse): your photos in full quality, with a text file of captions, places and dates.',
        '• ComClic album: for someone who has the app. They receive the whole folder and can edit it.',
        'Sending goes through your phone’s share sheet: Mail, Messages, WhatsApp, AirDrop, Files…',
      ],
    },
    backup: {
      title: 'Back up, restore, receive',
      body: [
        '• “Full Backup” gathers all your folders and settings into a single file. Keep it off the phone: iCloud Drive, Files, or email it to yourself.',
        '• To restore, tap “Import ComClic File” and pick that file. Folders are added; nothing is replaced or erased.',
        '• The same button opens a ComClic album received from someone else.',
        'Important: deleting the app erases its folders. Only a backup can bring them back.',
      ],
    },
    versions: {
      title: 'Trial, Light and full version',
      body: [
        '• Free trial: 3 albums sent, of up to 15 photos.',
        '• ComClic Light: unlimited albums.',
        '• Full version: professional report, backup, mark-up, 16 × 21 and 16 × 16 formats, collage covers, typefaces, maps.',
        'These are one-time purchases, with no subscription. “Restore purchases” brings them back on a new device.',
      ],
    },
    privacy: {
      title: 'Your photos stay with you',
      body: [
        'ComClic works without an account and collects nothing. Your photos and text stay on your phone; nothing leaves unless you send it.',
        'The only exceptions, handled by your phone: the name of a photo’s place and the map backgrounds, requested from the system’s map service.',
      ],
    },
  },
};

const CONTENT: Record<Lang, HelpContent> = { fr, en };

export function helpContent(lang: Lang): HelpContent {
  return CONTENT[lang] ?? fr;
}

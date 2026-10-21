# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Expo SDK 54** (React Native 0.81, React 19). The API surface changed significantly in
> recent SDKs — always confirm against https://docs.expo.dev/versions/v54.0.0/ before writing code.

## Commands

Il n'y a **ni tests, ni linter, ni CI** — `tsc --noEmit` est la seule vérification statique.

> ⛔ **Expo Go ne peut plus ouvrir ce projet** (constaté le 24/09/2026). L'Expo Go de l'App Store
> est passé au **SDK 57**, le projet est en **SDK 54** (`expo 54.0.37`) : Metro répond à l'appareil
> `Project is incompatible with this version of Expo Go`. Apple n'autorise que la dernière version
> d'Expo Go — **aucun QR, tunnel ou réglage réseau n'y changera rien**, et c'est une perte de temps
> garantie que de chercher la cause côté wifi ou pare-feu. Trois voies à la place :
> 1. **EAS Update** (`eas update --branch production`) pour toute modification **JS** : arrive en OTA
>    dans le build TestFlight déjà installé. C'est la boucle normale, quelques minutes.
> 2. **Development build** (`eas build -p ios --profile development`, profil déjà dans `eas.json`) :
>    rend la boucle Metro + QR utilisable, sans contrainte de version d'Expo Go.
> 3. **Montée en SDK 57** : le correctif de fond, mais il faut revalider Skia, `expo-share-intent`,
>    `expo-speech-recognition` et `expo-file-system/legacy`.

Boucle de validation côté PC (toujours valable, et le seul contrôle rapide) :
`npx expo start --clear` puis `curl "http://localhost:8081/index.bundle?platform=ios&dev=true"`
(HTTP 200 = le bundle compile ; c'est là que sortent les erreurs d'import/transform).
- ⚠️ Si le **port 8081 est déjà pris** par un autre projet, `npx expo start` s'arrête en mode non
  interactif (« Input is required… › Skipping dev server ») : démarrer avec `--port 8082` et
  interroger le bundle sur ce port. Vérifier **quel** projet occupe le port avant de tuer quoi que
  ce soit : `netstat -ano | grep :8081` puis `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"`.
- Bundle HTTP 200 ne prouve pas que l'iPhone a le nouveau code : contrôler que le **log Metro**
  montre bien un bundle servi à l'appareil, ou chercher une chaîne neuve dans le bundle téléchargé.
  Un appareil resté sur EAS Update / une vieille URL sert silencieusement l'ancienne version.

### Publication (détail dans `PUBLICATION.md`)
`PUBLICATION.md` (racine, **pas** dans `docs/` qui est public via GitHub Pages) détaille EAS Update,
EAS Build / TestFlight, Google Play et les pièges de connexion Expo Go. L'essentiel :
- **JS seulement** → `npx eas-cli update --branch production --message "..."` (canal du build
  TestFlight ; `preview` = Expo Go / builds internes ; se tromper de canal ne remonte aucune erreur).
- **Natif** (paquet natif, `app.json` `infoPlist`/plugins, icônes) → **nouveau build** obligatoire :
  `eas build --platform ios|android --profile production`. Un EAS Update n'y peut rien.
- `runtimeVersion` reste `{ "policy": "sdkVersion" }` dans `app.json`.
- ⚠️ **Épingler les paquets natifs sur la dist-tag du SDK, pas sur `latest`** : `npm install <pkg>`
  prend `latest` (SDK suivant), le plugin tourne mais **l'autolinking ne l'embarque pas** — vécu avec
  `expo-speech-recognition` 56.0.1 (bonne version : **3.1.3**). Toujours
  `npx expo install <pkg>@<version-sdk>`, contrôler avec `npm view <pkg> dist-tags`.

## Architecture

Application **mono-écran sans bibliothèque de navigation** : `App.tsx` détient tout l'état et
bascule entre chargement / `HomeScreen` (liste des dossiers) / `AlbumScreen` (photos d'un dossier)
selon `openAlbumId`. ⚠️ `Root`, `HomeScreen` et `AlbumScreen` sont des **fonctions d'`App.tsx`**
(fichier de plus de 1 000 lignes), pas des fichiers de `src/components/` : les chercher là. Tout se joue par superposition de modaux (`src/components/*Modal.tsx`). Au
lancement, `App` affiche d'abord `WelcomeScreen` (accueil **« ComClic »**, halo + reflet dessinés en
**Skia**, logo `assets/welcome-logo.png`) jusqu'au bouton « Commencer » (état `showWelcome`).

**Duplication d'un dossier** : bouton **⧉** d'`AlbumCard` → `duplicateAlbum` (App.tsx). Crée un
dossier « Copie de … » (`L.album.copyName`) et **copie les fichiers** de chaque photo via
`copyImage()` (`photoFiles.ts`, alias de `persistImage`) — jamais de réutilisation d'URI : la copie
doit être indépendante, sinon supprimer une photo de la copie effacerait le fichier de l'original
(`deleteImage` supprime le fichier disque). L'`originalUri` d'une photo ajustée est copié aussi (la
copie reste ré-éditable), et la photo de couverture est remappée. Un voile `busyOverlay` bloque
l'écran pendant la copie (`duplicating`).

**Entrées venues du système** (`expo-share-intent`, `src/components/ShareImportModal.tsx`,
`src/albumBundle.ts`) : l'app est une **cible de partage** (feuille de partage iOS via une share
extension, intents Android ; plugin + `iosAppGroupIdentifier` dans `app.json`). `Root` observe
`useShareIntentContext()` et remplit `pendingImport` : d'abord un **album ComClic** si le fichier
reçu passe `looksLikeBundle()` + `parseAlbumBundle()` (le manifeste porte le marqueur
`comclic-album`), sinon les **images brutes** partagées. Dans les deux cas `ShareImportModal` demande
le dossier de destination, puis `runAlbumImport` / `runImageImport` créent les `Photo` et
`finishImport` ouvre le dossier. Un partage qui n'est **ni** un album **ni** une image reconnue
déclenche l'alerte `alert.shareUnread…` (type reçu + nombre de fichiers) : sans elle, l'app
s'ouvrait et restait muette, indiscernable d'une extension de partage en panne. ⚠️ Module **natif** :
en Expo Go `hasShareIntent` reste faux (le provider est no-op) — ce flux ne se teste que sur un
build EAS.

**Sauvegarde de tous les dossiers** (`src/backup.ts`) : bouton **« 💾 Sauvegarder tout »** de la
barre d'`HomeScreen` → **confirmation** (`confirmBackup` : la préparation ne s'interrompt pas,
un appui par mégarde bloquait l'écran) → `buildBackup()` → un **seul `.comclic`** (ZIP + manifeste marqué
**`comclic-backup`**, à ne pas confondre avec `comclic-album`) contenant **tous** les dossiers, leurs
entrées (commentaires balisés, lieu, date, ordre, couverture, pages de texte) **et les réglages**
(langue, tri, options d'export) — puis la feuille de partage native, à l'utilisateur de le déposer
dans iCloud Drive / Fichiers / un mail. Rien ne part tout seul : l'app reste sans réseau.
- **Ce que ça couvre** : la sauvegarde iCloud de l'iPhone protège de la perte du téléphone, **pas de
  la suppression de l'app** — iOS efface alors le conteneur (fichiers image **et** base AsyncStorage).
  C'est le seul cas sans recours, et le seul que ce fichier adresse.
- **Restauration** par le **même** bouton que l'import d'album (`importBundleFile`) : `peekBackup()`
  lit **le manifeste seul** pour annoncer le contenu et demander confirmation — `parseBackup()` écrit
  les images sur le disque, le faire avant l'accord laisserait des fichiers orphelins à chaque
  annulation. `runBackupRestore` **ajoute** les dossiers : rien n'est fusionné ni remplacé, un nom
  déjà pris donne un doublon (`L.album.copyName`). Une restauration ne doit jamais pouvoir effacer un
  travail en cours. Le **partage entrant** reconnaît aussi une sauvegarde (même extension qu'un
  album), sinon le fichier tombait dans l'alerte « partage inexploitable ».
- Réglages restaurés : la **langue** s'applique tout de suite (`setLang`), les **options d'export**
  sont relues à l'ouverture d'un dossier, le **tri** au prochain lancement (l'accueil est déjà monté).
- ⚠️ **Plafond assumé : `MAX_BACKUP_PHOTOS` = 200**, images **recompressées** (budget adaptatif sur
  le total). JSZip construit l'archive **en mémoire** puis la convertit en base64 (+33 %) : au-delà,
  iOS tue l'app. Une sauvegarde en **pleine résolution** demandera une écriture **en flux** (API
  `File` du nouveau `expo-file-system` du SDK 54 — le projet est encore sur `legacy`). Ne pas lever
  le plafond sans ce changement.

**Recevoir un album sans le partage système** : le bouton **« ⤓ Importer un album reçu »** de la
barre d'`HomeScreen` (`importBundleFile` dans `Root`) ouvre l'app Fichiers via
`expo-document-picker`, puis rejoint le **même** chemin que le partage entrant —
`looksLikeBundle()` + `parseAlbumBundle()` → `pendingImport` → `ShareImportModal` (choix du dossier)
→ `runAlbumImport`. Double volontaire : `expo-share-intent` est natif donc **inerte en Expo Go**, et
la feuille de partage ne propose pas ComClic depuis toutes les apps. Le sélecteur demande `type: '*/*'`
— iOS ne connaît pas l'extension `.comclic`, un filtre par type ne renverrait rien ; le contrôle se
fait après coup sur le nom puis sur le manifeste.

**Dictée vocale** (`expo-speech-recognition`, `src/components/VoiceCommentButton.tsx`) :
reconnaissance **on-device** (iOS `SFSpeechRecognizer`) dans la langue courante de l'app ; la dictée
**s'ajoute** au commentaire existant (résultats partiels en direct, phrases finales figées). Là
encore **natif** : `CommentModal` ne monte le bouton que si le **module natif répond** (`typeof
mod.ExpoSpeechRecognitionModule?.start === 'function'` dans un `require` protégé), donc invisible
dans Expo Go.
> ⚠️ Ne **pas** conditionner ce montage à `isRecognitionAvailable()` : côté iOS il rend
> `SFSpeechRecognizer().isAvailable`, **faux tant que l'autorisation n'a pas été accordée**. Le test
> tournant au chargement du module, son résultat restait figé : pas de bouton → jamais de demande de
> permission → toujours faux. La disponibilité réelle s'éprouve **au clic**, après
> `requestPermissionsAsync()`.
> ⚠️ Les écouteurs `useSpeechRecognitionEvent` sont **globaux**. Une session `continuous: true` non
> arrêtée survivait à la fermeture de l'éditeur, et le bouton suivant se rebranchait dessus : le
> commentaire se remplissait tout seul. D'où `abort()` au démontage **et** rejet de tout résultat
> reçu hors enregistrement demandé (`recordingRef`).

**Données & persistance** (`src/types.ts`, `src/storage.ts`) : un `Album` (dossier) regroupe des
`Photo` stockées en **liste plate globale** (appartenance via `Photo.albumId`, filtrage à
l'affichage ; un export = un dossier). Tout l'état vit dans `useState` au niveau de `App`, réécrit
dans **AsyncStorage** par des `useEffect` à chaque changement (clés `*.v1`). `loadData()` migre les
anciennes données et **normalise `Photo.order`** (rang contigu par dossier). L'ordre d'affichage
suit `comparePhotos` (`order`, sinon `createdAt`) ; le **réordonnancement** se fait par boutons
**▲▼** dans `PhotoCard` (le glisser-déposer a été retiré : incompatible avec Reanimated 4), et pour
aller loin d'un coup, le **mode « Déplacer »** (bouton ⇅ entre ▲ et ▼, état `movingId` d'`AlbumScreen`) :
emplacements « Placer ici · position n » entre les cartes (`placeAt`, renumérotation complète), autres
cartes inertes et estompées, barre du bas remplacée par un bandeau avec « Annuler » (retour Android aussi). La
**photo de couverture** se choisit via l'**étoile** ★ de `PhotoCard` (`onSetCover`, une seule par
dossier ; sinon la 1ʳᵉ photo sert de couverture par défaut).

**Fichiers image, réglages & recadrage** (`src/photoFiles.ts`, `src/adjustments.ts`,
`src/components/CropModal.tsx`) : les URI de la caméra/galerie sont temporaires → `persistImage()`
**copie** vers `documentDirectory/album-photos/`. ⚠️ l'import est `expo-file-system/legacy`.
> ⛔ **iOS déplace le conteneur de l'app à chaque nouveau build** (`…/Application/<UUID>/` change) :
> une URI absolue enregistrée pointe alors dans le vide. Vécu au build 7 — toutes les photos en
> cadres vides. `loadData` passe chaque `uri`/`originalUri` dans **`rebaseImageUri`** (seul le nom
> de fichier sous `album-photos/` fait foi). Tout nouveau fichier durable doit vivre sous un dossier
> de `documentDirectory` et être recalculé de la même façon — jamais une URI absolue persistée telle
> quelle.
**Annotation au marqueur** (`AnnotateModal`, bouton pinceau de `PhotoCard`, les deux modes) : tracé
libre ou flèche, 4 couleurs, 3 épaisseurs, annuler / tout effacer. Toucher par **`PanResponder`** (RN
de base, pas de gesture-handler), trait en cours dans une `ref`. `Photo.annotations` en coordonnées
**normalisées** dans l'image affichée (réglages et rotation compris) ; `src/annotations.ts`
(`annotationPath`, lissage par milieux de segments, pointe de flèche) sert à l'écran **et** à la
gravure : **`bakePhoto(original, adjustments, annotations)`** (`adjustments.ts`) — `uri` = image gravée,
`originalUri` gardé, donc tout reste modifiable. Une **rotation** changée dans les réglages ou un
**recadrage** retirent les annotations (recadrage : confirmation préalable, `startCrop`). Actions de
la carte en grille 2 colonnes (5 boutons). Les annotations voyagent gravées dans l'image (sauvegarde,
`.comclic`), pas en tant que traits modifiables.
`AdjustModal` prévisualise en direct via une **matrice couleur 4×5 Skia** ; `bakeAdjustedImage()`
grave un nouveau JPEG (la photo garde `originalUri` + `uri` gravé + `adjustments`). `CropModal`
recadre par **format + position** (pas de gestes : fiable en Expo Go) via `expo-image-manipulator` ;
la version recadrée **devient la nouvelle base** (`uri` + `originalUri` remplacés, `adjustments`
réinitialisés).

**Chaîne d'export** (le cœur de l'app). Les **deux boutons du bas d'`AlbumScreen` sont les points
d'entrée** (ils pilotent aussi les libellés) :
- Les deux boutons du bas sont **Loisir** (familial — libellé `albumScreen.private`, renommé depuis
  « Privé » ; la clé garde son nom) et **Professionnel**. **Les deux** ouvrent
  `ExportModal` (mise en page) → « Aperçu » → `PreviewModal` → envoi. `ExportModal` est un **écran
  plein écran** (comme `CropModal` / `PreviewModal`) : en-tête ✕ + titre + badge Privé/Professionnel,
  corps défilant, barre d'action fixe gérant `insets.bottom`. Pas une feuille basse : la version
  précédente imitait une sheet système (`Modal transparent` + fond assombri + poignée dessinée) sans
  ses comportements, et son contenu ne défilait pas.
  Corps en **rubriques repliables** (`Section`, une seule ouverte, aucune à l'ouverture) : **Style**
  (typo, couverture, fond), **Photos**, **Textes**, **Cartes** — en pro seulement Photos et Textes.
  Chaque en-tête **résume** les choix en cours (`joinSummary`, clés `L.export.sum*`) ; les oui/non
  sont des **interrupteurs** (`SwitchRow`). L'écran alignait 16 réglages à plat : tout nouveau
  réglage va dans une rubrique existante **et** dans son résumé.
- En **pro**, `ExportModal` affiche **encadrement**, **lieu de prise de vue**, **date sous les
  photos**, **position de la date** et **alignement du texte** ; seuls **taille**, **fond** et **liseré** restent imposés
  (photo pleine largeur sur fond blanc). Ces quatre réglages sont honorés par les **deux** moteurs :
  `buildProDocument()` (`pdf.ts` — `frameCss` par `options.frame`, ligne de date retirée si
  `dateFormat: 'none'`, `.meta .row.date dd { text-align }`) **et** la branche `pro` de
  `renderPhotoPage()` (`pageImages.ts` — même correspondance d'encadrement, `align` du texte de
  date). ⚠️ Toucher l'un sans l'autre fait diverger l'aperçu PDF du rendu JPEG.
- **`showPlace`** (`ExportOptions`) masque le **lieu** dans les deux styles : légende `lieu · date`
  du familial (`figureHtml`, branche familiale de `renderPhotoPage`) et ligne « Lieu » du pro
  (`proEntryHtml`, branche pro) — la ligne disparaît en entier, pas seulement sa valeur. Les options
  déjà persistées n'ont pas la clé : `{ ...DEFAULT_EXPORT_OPTIONS, ...stored }` la ramène à `true`.
- Le pop-up format (`chooseFormat`) a **quatre options** : **PDF** (`sendPdf`), **Images de l'album**
  (`sendImages` = le rendu mis en page, 1 image/page → ZIP si plusieurs), et **Photos (à réutiliser)**
  (`sendReusablePhotos` → `zipPhotos` dans `albumZip.ts` = ZIP des **fichiers photo affichés** pleine
  résolution + un `contexte.txt` listant commentaire/date/lieu de chaque photo). Chacune ouvre la
  **feuille de partage native iOS** (`expo-sharing`). Un **ZIP** passe par Mail/AirDrop/Fichiers,
  Messages et WhatsApp (vérifié sur device le 01/10/2026).
  ⚠️ Envoi WhatsApp qui échoue sur « Impossible d'envoyer le message. Réessayez ou ouvrez WhatsApp » —
  PDF comme ZIP : c'est le **mode Économie d'énergie** de l'iPhone (l'extension de partage WhatsApp
  délègue l'envoi à l'app en arrière-plan, que ce mode coupe), **pas** ComClic. `expo-sharing` n'est
  qu'un `UIActivityViewController` standard. Désactiver le mode, ou partager une photo depuis
  l'app Photos pour contrôle, avant de chercher dans le code.
- La 4ᵉ option, **Album ComClic** (`sendComclicAlbum` → `albumBundle.ts`), envoie le `.comclic`
  (ZIP + manifeste) à un ami qui a l'app.
  ⚠️ Le fichier s'appelle en réalité **`Nom.comclic.zip`** (`BUNDLE_EXT`, aussi pour la sauvegarde) :
  aucun type `.comclic` n'est déclaré dans le build, donc iOS Messages l'affichait en fichier inconnu
  (ni aperçu ni enregistrement) et WhatsApp le renommait. L'import juge sur le **contenu**
  (`isZipFile` = signature `PK`, puis manifeste), pas sur le nom. Déclarer un vrai type de document
  (« Ouvrir avec ComClic ») exigera un **build natif**. Les photos sont **redimensionnées/recompressées** via
  `readPrintBase64()` avec le **même budget adaptatif que le PDF** (`maxEdge`/`quality` selon le
  nombre de photos) — envoyé souvent par SMS/iMessage, la pleine résolution (12 photos ≈ 36 Mo)
  était intransmissible. Contrairement à « Photos (à réutiliser) » (`sendReusablePhotos`), qui
  elle garde la pleine résolution : c'est un choix délibéré propre à cette option-là. Ce fichier
  `.comclic` ne s'ouvrant **qu'**avec ComClic, l'envoi est
  suivi de `offerInstallLink()` : une alerte propose d'envoyer, **dans un second message**, le lien
  d'installation (`shareInstallLink` de `src/links.ts` → `Share.share` de React Native, texte seul —
  la feuille de partage native ne transporte pas fichier + texte en un seul envoi).
  `INSTALL_URL` pointe vers `docs/index.html`, publié par **GitHub Pages**
  (`https://boccaraeric-jpg.github.io/photo-album-print/`) : page intermédiaire volontaire, pour
  pouvoir passer de TestFlight à l'App Store **sans republier de build**. Deux endroits à tenir à
  jour, et deux seulement : `src/links.ts` (in-app) et `docs/index.html` (la page).
  ⚠️ GitHub Pages sert **`main` + dossier `/docs`**, et le dépôt doit rester **public** (Pages sur
  dépôt privé = offre payante). Un commit resté sur une branche ne publie rien.
- `ExportOptions` (`src/types.ts`) : **taille** (`small`/`medium`/`large`/**`full`** = pleine page,
  légende ≤ 15 mots), fond, encadré, **liseré** (posé sur la photo, pas le support), **dateFormat**
  (`dayMonth`/`short`/`long`/`none` proposés ; `shortTime`/`full` retirés de l'écran, convertis par
  `sanitizeExportOptions`, `full` sert encore au `contexte.txt`), **dateAlign** et **textAlign** (gauche/centre/droite ;
  `textAlign` = alignement des **pages de texte**, honoré en pro **et** familial ; en familial il
  aligne **aussi le commentaire** sous chaque photo — `.caption` / `align` de `renderPhotoPage` —,
  la date gardant `dateAlign`. Le polaroïd ne force plus le centrage). Le **`style`**
  (`family`/`pro`) vient des boutons du bas. La date sous chaque photo est rendue en **minuscules**,
  taille réduite.
- **`commentVAlign`** (`top`/`middle`/`bottom`) place le commentaire dans la bande qui lui est
  réservée sous la photo — **familial uniquement** (le gabarit pro dispose sa fiche en flux, une
  expertise ne doit jamais voir sa description tronquée ; la pleine page a son propre bandeau
  `.full-cap`, déjà centré). En `top` (défaut) **aucune bande n'est posée** : le CSS est exactement
  celui d'avant, donc zéro régression pour qui ne touche pas au réglage. En `middle`/`bottom`,
  `.caption` reçoit une `min-height` (`CAPTION_BANDS` dans `pdf.ts`) et la photo perd d'autant
  (`CAPTION_BASES` = ce qu'occupait déjà une légende d'une ligne) : **la carte garde sa hauteur**,
  la pagination ne bouge pas. `min-height` et non `height` : un commentaire long continue de
  s'étendre au lieu d'être rogné. Côté JPEG, `pageImages.ts` mesure le bloc (`measureRich`) puis
  répartit le vide dans `captionH`.
- **Typographie & couverture** (`typeface` `sans`/`serif`/`script`, `cover`
  `classic`/`scatter`/`filmstrip`) — **familial uniquement**, le pro les force à `sans`/`classic`.
  Source unique : **`src/albumStyle.ts`** (`TYPE_SPECS` = famille par rôle titre/légende/texte/date ;
  gabarits de couverture en **points A4** que le PDF pose en absolu et que Skia multiplie par
  `W / COVER_W`). Retoucher un placement là, jamais dans un seul moteur. Le pêle-mêle tire son
  désordre d'une **graine** (`seedOf` des ids) : jamais `Math.random`, sinon PDF et JPEG divergent.
  Montage sans assez de photos (< 3 pêle-mêle, < 4 grille) → `effectiveCover` retombe sur `classic`.
  Pêle-mêle : **un gabarit par nombre** (3 → 9, `SCATTER_LAYOUTS`), photos d'autant plus grandes
  qu'elles sont peu nombreuses. Les photos se choisissent **par dossier** (`Album.scatterPhotoIds`,
  ordre = ordre de choix, la 1ʳᵉ au centre) dans un panneau d'`ExportModal` — surcouche `<View>`,
  pas `<Modal>`. Sans choix valable (`validScatterPicks`) : automatique, ★ + suivantes, 7 au plus.
  Reporté par `duplicateAlbum` ; **pas** porté par la sauvegarde ni le `.comclic` (retour à
  l'automatique).
  **Lisibilité des commentaires** (retour testeurs « trop petits, trop pâles ») : réglage
  `commentSize` (normal / **grand par défaut** / très grand, `COMMENT_SCALE`), corps et encres
  partagés dans `albumStyle.ts` (`COMMENT_BASE`, `CAPTION_INK`, `META_*`), Caveat en **bold**
  (`captionBold`). La photo cède la place (`commentShrink`), le seuil de page seule baisse
  (`isLongComment(photo, scale)`). Skia n'a plus de coupure à 2 lignes : la bande se mesure.
  Les montages **gardent** la photo ★ dans les pages (la règle d'exclusion ne vaut qu'en `classic`).
  En `script`, les pages de texte restent en Lora (Caveat illisible au long cours) ; les **dates**
  (lieu · date, période de la page de fin) suivent la typographie choisie (`spec.date`, Caveat
  agrandi ×1,45 et en gras en manuscrite — retour testeur). Format de date « Jour et mois »
  (`dayMonth`, « 8 juillet », sans l'année) en tête des choix.
  Contrôle visuel possible **sur PC** : `buildAlbumHtml` tourne sous node (sucrase + bouchons des
  modules Expo) et Chrome headless fait la capture — le rendu Skia, lui, ne se voit que sur l'iPhone.
- **Carte des lieux** (`showMap`, familial, défaut non) : page « Nos lieux de visite » après la
  couverture. **`src/albumMap.ts`** calcule toute la page (lieux, cadrage, côtes, repères,
  étiquettes, médaillon, légende) en une **liste de tracés SVG + textes en points A4** : `pdf.ts`
  (`mapPageHtml`) l'écrit en SVG, `pageImages.ts` (`renderMapPage`) la dessine en Skia — aucun
  placement dans les moteurs, retoucher `albumMap.ts` seul. Tracés limités à `M L H V C Q Z`
  (pas d'arc `A`), ombre décalée sans flou, largeur de texte **estimée** (`CHAR_EM`) : tout ce
  qui garantit la parité des deux rendus. Lieux = photos avec **`coords`** seulement (un lieu tapé à
  la main n'a pas de position), regroupés par nom de lieu, numérotés par date, 20 au plus.
  Fond de carte **hors ligne** : `src/worldLand.ts` (~0,84 Mo, Natural Earth 1:10m, domaine public)
  généré par `design/build-worldmap.py` (mode d'emploi en tête du script), décodé une fois par
  `worldMap.ts`. Pas de noms de pays sur la carte : la donnée n'a que des contours.
- **Cartes à côté des photos** (`photoMaps`, familial, défaut non) : la bande image d'une photo se
  partage photo (60 %) / carte (`MAP_SHARE`, `MAP_GAP`) ; en grille 2×2 la photo avec carte prend
  une **ligne entière** (`wideSlots` de `paginate.ts`, mêmes cases dans les deux moteurs) ; en
  pleine page, médaillon (`FULL_MAP`). Quelles photos : `mapPhotoIds` = d'office quand le lieu
  change (`autoMapIds`), corrigé par **`Photo.mapMode`** (`on`/`off`, éditeur de commentaire). Avec
  cette option, la page « Nos lieux » ne garde que les lieux qui ont une carte. Choix en lot : bouton « Choisir » d’`ExportModal` (surcouche `<View>`, `onSetMapModes`)
  (`photosOfMappedPlaces`). Image : **Apple Plans** via le module **local natif**
  `modules/comclic-map` (`MKMapSnapshotter`, iOS seul, autolinké depuis `./modules`) →
  `src/mapSnapshot.ts`, un JPEG par lieu gardé dans `documentDirectory/map-snapshots/`. Sans le
  module (Android — **jamais de clé Google payante** —, Expo Go, build antérieur) ou sans réseau
  (12 s) : carte stylisée hors ligne `buildMiniMapModel`. ⚠️ Toucher au Swift = **nouveau build**.
  Skia décode les cartes **page par page** (~4 Mo chacune). `coords` et `mapMode` ne sont **pas**
  portés par la sauvegarde ni le `.comclic`.
- **Types d'entrées** : une `Photo` est soit une image, soit une **page de texte** (`kind: 'text'`,
  `uri` vide, `comment` = le texte) créée par « ＋ Page de texte ». `src/paginate.ts`
  `paginateEntries()` renvoie des `AlbumPage` (`photos` groupées | `text` autonome) ; les pages de
  texte s'intercalent dans **les deux** rendus.
  À la création, `addTextPage` (App.tsx) demande **où placer la page** : « À la fin » laisse
  `order` indéfini (`comparePhotos` range l'entrée en dernier), « Au début » **renumérote tout le
  dossier** et donne `order: 0` à la nouvelle page — poser `order: 0` sans renuméroter créerait un
  ex æquo avec la 1ʳᵉ photo. « Au début » = juste après la 1ʳᵉ de couverture, celle-ci étant une
  page générée au rendu et non une entrée du dossier.
- `src/pdf.ts` `buildAlbumHtml()` (familial) / `buildProDocument()` (pro, photos numérotées,
  Lieu / Date / Description, pages de texte intercalées, flux `page-break-inside: avoid`). La **1ère
  de couverture** = titre **sans année** (retirée : qui la veut l'écrit dans le titre) + **la seule photo de
  couverture** + repères de coupe. La photo de couverture n'est **pas** répétée dans les pages
  **sauf si elle porte un commentaire** (familial ; le pro n'a pas de photo en couverture).
  `htmlToPdfFile()` rend via `expo-print` puis **renomme**
  (`albumFileBase` = « NomAlbum JJ-MM-AAAA »).
- ⚠️ **Poids du PDF** : `buildAlbumHtml()` intègre chaque photo via **`readPrintBase64()`**
  (`photoFiles.ts`), qui **redimensionne + recompresse** en JPEG (côté long plafonné, cache mémoire)
  **avant** l'encodage base64. Ne **jamais** revenir à `readBase64(photo.uri)` sur l'original :
  embarquer du 4000 px pour un affichage A4 donnait des PDF de ~190 Mo (9 photos). Budget adaptatif au
  nombre de photos (≤15 → 1600 px/q0.72 ; >30 → 1024 px/q0.68). `htmlToPdfFile()` `console.warn` si le
  fichier dépasse 10 Mo. L'export « Photos (à réutiliser) » garde, lui, la **pleine résolution**.
- **Aperçu interactif** (familial) : `buildAlbumHtml(..., interactive = true)` enveloppe chaque
  entrée d'un lien **`comclic-edit://e/<id>/<ids de la page>`** que `PreviewModal` intercepte dans
  `onShouldStartLoadWithRequest` → panneau **taille de la photo** (`Photo.size`) et **fond de la
  page** (`Photo.pageBg`, commun à la page : un nouveau fond efface celui des voisines). App
  (`editPreviewEntry`) enregistre puis reconstruit l'aperçu, recentré sur
  l'entrée (`injectJavaScript` à `onLoadEnd`, aperçu masqué jusque-là — `injectedJavaScript` ne s'exécutait pas sur l'iPhone). JS activé **seulement** pour ce script de l'app : la CSP du document interdit toujours
  tout script de l'album. Jamais de liens dans le PDF envoyé. Côté rendu : couleurs en **variables
  CSS** (`themeVars`, redéfinies sur une `.sheet.painted` de 842 px), hauteurs par taille sous
  `.sz-<taille>` (`sizeCss`), pagination par taille (`paginateEntries(..., albumSize,
  { perPhotoSize })` : une page ne mélange pas deux tailles) ; Skia passe `{ ...options,
  background }` page par page. `size`/`pageBg` ne sont **pas** portés par sauvegarde ni `.comclic`.
  En aperçu, les pages sont posées en **feuilles** sur un plan de travail gris (`DESK_CSS`, `body.desk`,
  viewport élargi de `DESK_GAP`) : format exact, ombre, écart — jamais dans le PDF envoyé.
- **Fonds** : `ALBUM_BACKGROUND_GROUPS` (`theme.ts`) = 18 couleurs en trois familles (clairs, naturels,
  profonds), pastilles groupées dans `ExportModal` et `PreviewModal`. Pas de tons moyens (texte
  illisible en encre sombre comme claire). Gris des petits textes partagé par les deux moteurs :
  **`mutedInk(bg)`** (`albumStyle.ts`), plus foncé sous 215 de luminance (kraft, taupe, sauge).
  Ne jamais changer la valeur d'une couleur existante : elle est enregistrée dans les réglages.
- `PreviewModal` rend **le même HTML** dans une **WebView**. L'envoi JPEG : `src/pageImages.ts`
  compose chaque page en **Skia** (déterministe, hors-ligne — la capture de WebView est peu fiable
  sur iOS) ; plusieurs pages → **ZIP** (`src/albumZip.ts`, `jszip`).
- **Format de page** (`ExportOptions.format`, `src/pageFormat.ts`, familial ; le pro reste en A4 via
  `effectiveFormat`) : **A4** ou **16 × 21 cm**. Tout se met en page sur **595 unités de large** ; seule
  la hauteur change (842 / 780) et `heightCut` se retranche des gabarits verticaux (photos, photo de
  couverture, pleine page, fin) ; pêle-mêle, grille et page « Nos lieux » reçoivent `pageH`. Le PDF est
  ensuite **réduit** à sa vraie taille (`printScale` : `html { zoom }` + `@page`, et `print` passé à
  `expo-print`) — 16 × 21 cm = 453,5 × 595,3 pt ; 780 et non 781, sinon une fraction de point déborde
  en page blanche. Images Skia : 1240 px de large, `imageH` de haut. Contrôlé sous Chrome (taille et
  nombre de pages) ; ⚠️ le `zoom` à l'impression iOS reste à confirmer sur appareil.
  **16 × 16 (carré, `square`)** : hauteur 594, gabarits **propres** et non un simple retranchement —
  `SQUARE_PH` (pdf.ts), moyennes **côte à côte** (`.fmt-square` sur `body` ; Skia `gridFor(..., square)`
  = 2 colonnes × 1 rangée), carte d'une moyenne **sous** la photo (`mapBelow`, sauf photo seule
  agrandie), couverture classique resserrée, pêle-mêle moins réduit en largeur (`sx`), écart grille →
  titre réduit, légende de la page « Nos lieux » sur 3 colonnes (`cols` d'`albumMap.ts`).
- **Photos centrées sur la page** (familial) : `.sheet.photos` a la hauteur exacte de la page et
  centre le bloc en flex (seule exception au « pas de flex vertical », sûre parce que la feuille est
  de hauteur fixe et que les tailles de `sizeCss` tiennent dans la page) ; numéro en pied hors flux ;
  rangée incomplète de la grille centrée. Pendant Skia : `offsetY` / `offsetX` de `renderPhotoPage`.
  Le pro coule en haut de page, dans les deux moteurs.
  **Aucun fond dans la case photo** (`.ph`, `.ph-photo`) : un portrait dans une case horizontale se pose
  sur le cadre ou la page ; l'ancien aplat gris (`--ph-bg`) « salissait » le rendu (retour testeur).
  Skia n'en a jamais eu.
  **Carte = photo** : mêmes coins arrondis (`PHOTO_RADIUS` par encadrement, `albumStyle.ts`) et même
  liseré (`LISERET`) que la photo voisine, dans les deux moteurs — Skia arrondit aussi les photos
  (`drawContainImage(..., radius)`, `drawMiniMap(..., radius)`), ce qu'il ne faisait pas.
- **Page de fin** (familial) : ornement, période, et **`ALBUM_CREDIT`** (« Powered by ComClic »,
  `albumStyle.ts`, non traduit) en pied, corps et police des dates (`META_SIZE`, famille `meta`).
  Les images de l'album l'ont aussi depuis l'ajout de cette mention (`renderEndPage`, fichier
  `…pzz-fin.jpg`, ✦ dessiné en tracé : la police embarquée n'a pas le glyphe). Le pro n'a pas de
  page de fin : la mention suit sa dernière fiche (`.credit` de `buildProDocument`, 12 px, gris des
  intitulés ; une page de texte finale perd son saut de page pour ne pas la laisser seule) et, en
  images, s'inscrit au-dessus du numéro de la dernière page (`drawProCredit`, paramètre `credit`).
- **Logo après la mention** : `LOGO_MARK_SVG` (`albumStyle.ts`, copie de `design/logo-mark.svg` à garder
  synchrone) — SVG en ligne dans le PDF (`creditHtml`, `.credit` en flex), `Skia.SVG.MakeFromString` +
  `drawSvg` dans les images (`drawCredit`). Hauteur = `LOGO_MARK_SCALE` × corps du texte.
- **Rapport pro en pages explicites** (plus de flux) : `paginateProEntries` (`paginate.ts`) range les
  fiches par page d'après leur **hauteur estimée** (`PRO_LAYOUT`, `proEntryHeight` : vignette + lignes de
  description) — une page ne mélange pas deux tailles, une grande a sa page. Le PDF (`.sheet.pro-page`,
  `min-height` A4 : une estimation fausse allonge la feuille au lieu de tronquer une description) et les
  images (`renderProPage`, mêmes mesures, description entière) suivent **les mêmes pages**. Aperçu pro
  en feuilles sur plan de travail, numéros de page, mention de l'app en pied de la dernière.
  **Taille du texte pro** : `ExportOptions.proTextSize` (normal par défaut, `PRO_TEXT_SCALE` 1 / 1,25 / 1,5,
  paliers plus francs que le Loisir), **`proTextBold`** (valeurs et pages de texte en 800), vignettes
  réduites d'autant (`proFrameH`), intitulés grandissant moitié moins.
- **Position d'une page de texte** (`Photo.textVAlign` haut/milieu/bas, réglée dans l'aperçu, les deux
  styles) : défaut milieu en Loisir, haut en pro. `.tv-*` des deux gabarits, `startY` de `renderTextPage`.
- **Taille des photos du rapport pro** : pour tout le rapport, `ExportOptions.proPhotoSize` (Mise en
  page › Photos, défaut moyenne) ; par photo, `Photo.proSize` (**distinct** de `size` du Loisir), réglée
  dans l'aperçu (aperçu désormais interactif dans les deux styles ; en pro, taille seule — prop `pro`
  de `PreviewModal`, pas de fond). PDF : vignette `PRO_FRAME_H` (190/300/470), les **petites** en
  `inline-block` deux par ligne (jamais de flex : la fragmentation d'impression le coupe mal), lignes
  centrées pour qu'une petite **seule** ne reste pas calée à gauche (Skia : `offsetX` vaut aussi en pro).
  Skia : `proSize` mappé sur `size` avant `paginateEntries` (petite = grille 2×2, grande = 1/page).
  Pas porté par la sauvegarde ni le `.comclic`.
- ⚠️ **`-webkit-text-size-adjust: 100%`** sur `html` dans les **deux** gabarits : sans lui, iOS agrandit
  d'office les petits textes d'une page réduite à l'écran (« text autosizing ») et l'aperçu ne montre
  plus les vraies tailles — vécu avec la taille du texte pro, sans effet visible sur l'iPhone.
- **Titre de couverture** (`Album.coverTitle`, champ en tête de la rubrique Style, prérempli du nom
  du dossier) : peut être coupé à la main (`
`, 3 lignes au plus). Le **nom du dossier** accepte aussi
  un retour à la ligne (2 lignes, `NameModal` et titre d'`AlbumScreen` multilignes, `limitLines`) ;
  pour les fichiers et le partage il passe sur une ligne (`oneLine` → `albumTitle`), et nomme toujours
  les fichiers (`albumTitle` ≠ `coverTitle` dans `AlbumScreen`,
  `buildAlbumImages(..., coverTitle)`). Mise en page : `coverTitleLayout` (`albumStyle.ts`) estime
  lignes et hauteur (`CHAR_EM`, désormais partagé avec `albumMap.ts`), réduit le titre au-delà de
  2 lignes ; le pêle-mêle se range **sous** le titre et s'y centre (`scatterSlots(..., zoneTop)`), la grille cède de la hauteur (`gridLayout(..., titleBlock)`), la
  classique laisse la photo céder en CSS (`.cover` en colonne, `flex-basis`). Skia : `wrapLines`
  respecte désormais les `
`. Pas porté par la sauvegarde ni le `.comclic`.
- Contraintes de mise en page PDF **à ne pas casser** : dimensionner en **px = points** (A4
  595×842), **jamais de `vh`**, **hauteurs fixes** en familial, et
  `print-color-adjust: exact` (sinon iOS supprime fonds/ombres).

**Mise en forme du commentaire** (`src/richText.ts`, `src/components/RichText.tsx`) : le gras et le
souligné vivent comme **balises dans la chaîne** `Photo.comment` — `**gras**`, `__souligné__` —
et non dans un modèle riche. Ce champ traverse AsyncStorage, le `.comclic`, le `contexte.txt` du
ZIP, la dictée et le correcteur : un tableau de segments aurait imposé une migration à chacun.
Le **correcteur n'est pas perturbé** (ses jetons sont des suites de lettres, `*`/`_` n'en font pas
partie, aucun offset ne bouge). `CommentModal` pose deux boutons **B/U** qui encadrent la sélection
courante (`toggleMark`, espaces de bord exclus) — **rien de sélectionné = tout le commentaire**,
et la barre **annonce sa cible** (« appliqué au texte sélectionné » / « à tout le texte »),
la seule façon trouvable de tout mettre en gras (insérer une paire vide au curseur ne servait à
rien : on ne tape pas « en gras », le curseur ressort de la paire). Réservé au **commentaire d'une
photo** : pas sur les pages de texte, ni sur le nom de dossier / le lieu (qui servent de nom de
fichier et de clé de tri).
> ⚠️ **Une seule zone de texte à l'écran, jamais deux.** RN ne sait pas afficher une graisse
> partielle dans un `TextInput` : les balises doivent donc rester visibles **pendant la saisie**.
> D'où la bascule sur le focus (`editing`) — hors saisie, un commentaire balisé s'affiche **rendu**
> (`RichText` dans un `Pressable` au gabarit de `input`, « Toucher pour modifier »), et le `TextInput`
> ne revient qu'au toucher (`autoFocus={editing}`). La première version empilait le champ **et** un
> bloc d'aperçu : deux fois le même texte, l'un balisé l'autre rendu — les testeurs y ont vu deux
> commentaires enregistrés, et c'était compréhensible. Ne pas réintroduire d'aperçu permanent.
> Sans marque, le champ reste un `TextInput` ordinaire : zéro changement pour qui n'utilise pas B/U.
> ⚠️ **iOS annule la sélection avant que le bouton ne réagisse** : le champ émet une sélection
> **vide** en perdant le focus, et le menu natif (Couper/Copier/Coller), qui s'ouvre **sous** le mot,
> mange le premier appui. On lisait donc « rien de sélectionné » et la marque partait sur tout le
> texte — le gras semblait marcher (il visait tout de toute façon), le souligné d'un mot jamais.
> Trois parades cumulées, à ne pas défaire : barre **au-dessus** du champ (hors du menu natif),
> **`onPressIn`** et non `onPress` (l'appui-bas précède la perte de focus), et **mémoire de la
> dernière plage non vide** (`remembered`), effacée seulement à la frappe.

> Les **deux** moteurs doivent suivre, comme pour tout réglage d'export : `richToHtml()` côté
> `pdf.ts` (légende familiale, pleine page, description pro) et **`drawRichText()`** côté
> `pageImages.ts`. Skia n'a ni graisse partielle ni décoration : `drawRichText` mesure mot à mot avec
> la police du fragment (`fontFor`, cache par graisse+taille) et **trace le souligné au trait**.
> Partout où le commentaire redevient du texte nu — `contexte.txt` et noms de fichiers du ZIP,
> `isLongComment()` de `paginate.ts` — passer par **`stripMarks()`**, sinon les balises comptent
> dans la longueur et basculent une photo sur une page entière pour rien.

**Clavier dans l'éditeur de commentaire** (`CommentModal`) : le clavier recouvrait le champ (retour
testeur, on tapait à l'aveugle). À son ouverture (`keyboardWillShow` iOS / `keyboardDidShow`
Android) : photo réduite à 84 pt, poignée masquée, marges du bas resserrées (plus besoin de la marge
de barre d'accueil), puis `keyboardDidShow` fait défiler jusqu'au **champ touché** (commentaire ou
lieu, positions relevées par `onLayout`). Ne pas retirer le `KeyboardAvoidingView` : il remonte la
feuille, ce code remonte le champ dans la feuille.

**Lieu et date de prise de vue** (`src/exif.ts`, `src/photoLocation.ts`, `src/geocode.ts`) :
PHPicker (iOS) **caviarde les métadonnées** de l'asset remis à l'app, donc l'EXIF est souvent vide.
Deux résolutions bâties sur le même schéma — EXIF, puis `expo-media-library` via l'`assetId` :
`resolveCoords()` pour le GPS (puis, pour une photo prise dans l'app, la **position de l'appareil**)
et `resolveTakenAt()` pour la date (`creationTime` de la photothèque). Sans ce second repli, une
photo importée héritait de sa date d'**import** — `photoDate()` retombant sur `createdAt`.
`reverseGeocode()` transforme les coordonnées en « Ville, Pays » (permission demandée **seulement
sur Android**). Repli : saisie manuelle du `Photo.place` dans `CommentModal`.

**Correcteur français** (`src/spellcheck.ts`, `src/frenchRules.ts`, `SpellCheckModal`) : 100 %
hors-ligne. Orthographe = **index phonétique précalculé** `src/frenchPhonetic.json` (~336 000 formes,
généré avec `talisman/phonetics/french/phonetic` + `an-array-of-french-words`) + Levenshtein ;
grammaire/expressions = **règles regex** (`frenchRules`, ex. « tout le tant » → « tout le temps »,
élisions). `SpellCheckModal` est une **surcouche `<View>` (pas un `<Modal>`)** : iOS ne présente pas
deux Modal imbriqués.

Deux niveaux de correction, complémentaires :
1. **Correcteur natif iOS** (`spellCheck` + `autoCorrect`, = celui des SMS : souligné rouge en direct,
   tap-pour-corriger, autocorrection, prédiction) **activé** sur tous les champs texte
   (`CommentModal` commentaire/page de texte, `NameModal`, titre d'album). Sa langue suit le **clavier
   actif** de l'utilisateur. Exception : le champ **Lieu** garde `autoCorrect={false}` (nom propre) mais
   `spellCheck` actif. C'est la réponse au ressenti testeurs « pas de correcteur » — ne **pas** le
   recouper.
2. **Passe offline FR** (bouton « ✓ Vérifier orthographe & grammaire » de `CommentModal` →
   `checkSpelling` → `SpellCheckModal`) : complète le natif avec la **grammaire/expressions** FR
   qu'Apple ne voit pas (mot valide mais mal employé). **Aucun réseau** — ne jamais faire croire à
   l'utilisateur qu'une connexion est requise.

**Thème « Chambre Claire »** (`src/theme.ts`) : palette **crème / encre / terre de Sienne** (objet
`C`) et polices (objet `F`). **Typographie unifiée sur Montserrat** dans **toute** l'interface : les
clés `F` gardent leurs noms d'origine (`display` / `mono` / `monoBold`, hérités de l'ancien Gloock +
IBM Plex Mono) mais pointent désormais vers Montserrat — `display` = **MontserratExtraBold** (800,
titres), `mono` = **Montserrat** (500, corps / labels / champs), `monoBold` = **MontserratBold** (700,
boutons). Les 3 `.ttf` sont dans `assets/fonts/` (`Montserrat-Medium/Bold/ExtraBold.ttf`), chargés au
démarrage via `useFonts` d'`expo-font` dans `App()` (écran crème tant que les polices ne sont pas
prêtes). Gloock + IBM Plex Mono restent dans `assets/fonts/` mais **ne sont plus chargés** (retour
arrière possible en éditant seulement `src/theme.ts` + le `useFonts` d'`App.tsx`). Réutiliser `C`/`F`
pour tout nouveau style plutôt que de re-hardcoder des hex.
> ⚠️ **`fontWeight` ne marche pas avec une famille custom sur iOS** : chaque graisse est une famille
> distincte. Ne jamais poser `fontWeight` sur du texte en `F.*` (il est silencieusement ignoré) —
> choisir la bonne clé `F` à la place. Tout l'ancien `fontWeight` de l'interface a été retiré.

Le rendu **album (PDF + JPEG)** utilise **Montserrat** embarquée en base64 (`src/montserratFonts.ts`,
graisses **500** corps / **800** titres) : le PDF via `@font-face` (data URI), le JPEG via Skia
(`Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBase64(...))`). Interface et rendu album
partagent donc maintenant la même famille (500/800). Georgia reste en police de secours CSS uniquement.

**Internationalisation** (`src/i18n.ts`) : **FR + EN** (Phase 1), sans lib externe. Un dictionnaire
`{ fr, en }` typé `Dict = typeof fr` — l'anglais **doit** couvrir exactement les mêmes clés (erreur
de compilation sinon). Valeurs = chaînes **ou fonctions** (pluriel/interpolation, ex.
`album.photoCount(n)`, `alert.deleteAlbumTitle(name)`). Détection au 1er lancement via
**`expo-localization`** (langue de l'iPhone), sinon langue forcée persistée (`storage.loadLang`).
- **Dans React** : `const { L, lang, setLang } = useLang()` (Context → re-render à la bascule). Texte
  = `L.section.key`. Bascule FR/EN = sélecteur dans l'en-tête `HomeScreen` (`setLang`).
- **Hors React** (`pdf.ts`, `pageImages.ts`, `dateFormat.ts`, `albumZip.ts`, `links.ts`) : `lang: Lang` passé en
  **paramètre** ; libellés via `dict(lang).…`, dates via `localeTag(lang)`. `buildAlbumHtml` /
  `buildAlbumImages` / `zipPhotos` prennent `lang` en dernier argument (défaut `'fr'`).
- Le **correcteur offline FR** (`checkSpelling`, index phonétique FR) n'a pas d'équivalent EN : son
  bouton est **masqué hors français** dans `CommentModal` (le natif iOS gère l'anglais).
- **Ajouter une langue (Phase 2 : DE/IT/ES/PT)** = ajouter la clé dans `SUPPORTED`, un objet complet
  dans `DICT`, et `localeTag`. **Aucun code composant à toucher.** ⚠️ Le **japonais est exclu** : les
  rendus album embarquent **Montserrat** (sans glyphes CJK) → il faudrait une police CJK dédiée.

## Dépendances & assets à connaître
- **Modules natifs absents d'Expo Go** — ne se valident que sur un build EAS : `expo-share-intent`
  (import par partage système), `expo-speech-recognition` (dictée). Le code doit rester **tolérant**
  à leur absence (provider no-op, bouton non monté), sinon Expo Go crashe au lancement.
- `react-native-reanimated` / `react-native-worklets` sont **présents mais plus utilisés** (restes
  du glisser-déposer supprimé) — sûrs à retirer si besoin.
- `src/frenchPhonetic.json` est un **asset généré de ~5,9 Mo** (bundle ~15 Mo, premier chargement
  plus long) : ne pas le supprimer ; régénérable par un script node (talisman + `an-array-of-french-words`).
- `src/montserratFonts.ts` = **~0,9 Mo** de base64 (graisses 500 + 800), généré une fois depuis
  `@expo-google-fonts/montserrat`. `src/albumFonts.ts` = **~0,5 Mo** (Lora 400/700, Caveat
  400/700), **sous-ensemble latin** via `pyftsubset` (fonttools, venv temporaire) depuis
  `npm pack @expo-google-fonts/lora|caveat` — `npm pack` ne touche pas `node_modules`. Seuls
  `Lora-Bold` / `Caveat-Bold.ttf` sont dans `assets/fonts/` (échantillons de `ExportModal`).
  Le PDF n'embarque que les familles employées (`famsUsed`).
- **Icônes & logo** : sources SVG et procédure de régénération dans **`design/README.md`**
  (dessin actuel « v7 » = monogramme « CC » seul, historique des versions refusées, `sharp` en
  `--no-save`, table des PNG produits dans `assets/`). Retoucher le dessin = éditer le SVG puis
  relancer `node design/build-icons.js`, **jamais** repartir d'un PNG ou d'un JPEG. ⚠️ Ces icônes
  **n'apparaissent que dans un build natif** — sous Expo Go l'app porte l'icône d'Expo Go.
- **Logo dans l'app** : `WelcomeScreen` utilise `welcome-logo.png` (grand, fond crème) ;
  `HomeScreen` et `AlbumScreen` affichent `logo-mark.png` en **34 px** dans leur en-tête (styles
  `brandRow` / `brandRowSpread` / `brandLogo` d'`App.tsx`) — accueil à gauche du sur-titre, écran
  dossier à droite du lien de retour. Ce rappel-là, contrairement à l'icône système, **est** visible
  dans Expo Go.
- **Outils PC uniquement, jamais dans les deps RN** : `sharp` (génération icônes + logo), `qrcode`
  (QR Expo Go), `@expo-google-fonts/montserrat` (extraction des TTF pour le base64). Les installer en
  **`npm install <pkg> --no-save`**, générer, puis **nettoyer** : `npm uninstall <pkg> --no-save` et
  au besoin `rm -rf node_modules/<pkg>` ; **vérifier** que `package.json` est inchangé
  (`diff` avec une copie avant install). La skill de design vit dans `.agents/skills/` (non suivi,
  hors commits, comme les notes `*.doc` et `skills-lock.json`).
  ⚠️ Ce cycle install/désinstall **fait tomber Metro** s'il tourne (`ENOENT ... watch
  'node_modules/.<tmp>'`, le watcher suit un dossier temporaire disparu) : générer les assets
  **Metro arrêté**, ou le relancer ensuite. Détail de la chaîne d'icônes : `design/README.md`.

### Règle générale : ne jamais toucher `node_modules` avec Metro allumé
Vaut pour `npm install/uninstall`, `npx expo install` **et `npm dedupe`**. Metro garde en cache la
carte des modules : un paquet déplacé ou dédupliqué pendant qu'il tourne donne, à chaque
rechargement, `Unable to resolve module <nom>` pointant un chemin qui n'existe plus — alors que le
paquet est bien installé (vu avec `expo-constants` après un `npm dedupe`). Le code n'est pas en
cause, inutile de le chercher. Remise en route : arrêter Metro, supprimer `node_modules/.cache` et
`$TEMP/metro-cache` + `$TEMP/metro-file-map-*`, puis `npx expo start --clear`.

## Liste des dossiers (accueil)
Le tri par **poids** ignore les `originalUri` conservés pour la ré-édition : c'est le poids de
l'album, pas l'occupation disque. Le nombre de photos par dossier vient d'une `Map` mémoïsée sur
`photos` — la liste est plate, un `filter` par carte serait quadratique.

## Prise de photo
`＋ Nouvelle photo` ouvre **`src/components/CameraModal.tsx`** (`expo-camera`, `CameraView`), pas la
caméra système. Raison : `ImagePicker.launchCameraAsync()` déclenche l'écran iOS **« Use Photo /
Retake »**, que l'API n'expose aucun moyen de sauter ; il faisait doublon avec la suppression depuis
le dossier. Le déclencheur renvoie la photo **immédiatement** à `onCapture` (App.tsx), dont le
pipeline est **non bloquant** : `saveToPhotoLibrary()` part sans être attendu, la position vient de
`getLastKnownCoords()` (immédiate), et seul `persistImage()` bloque — le fichier doit exister avant
l'ajout au dossier. L'éditeur de commentaire s'ouvre donc tout de suite ; le **point GPS précis**
(`getCurrentCoords()`, plusieurs secondes en intérieur) arrive **en arrière-plan** et corrige les
coordonnées, puis résout le lieu si la position immédiate manquait. C'est aussi lui qui demande la
permission de localisation au besoin. Attendre ces deux tâches figeait l'écran plusieurs secondes
après chaque déclenchement. `expo-image-picker` reste utilisé pour l'**import galerie** : `pickFromLibrary` pose un voile
d'attente (`importing`, « Veuillez patienter… » + compteur) **avant** d'ouvrir la photothèque — la
longue attente (iOS qui prépare les fichiers choisis) a lieu **dans** `launchImageLibraryAsync`, après
« Ajouter » ; pendant le choix, le voile est caché derrière la feuille. Levé dans un `finally`.
`extractTakenAt()` (`src/exif.ts`) accepte donc les deux formes (`Pick<ImagePickerAsset, 'exif'>`).
`expo-camera` est **bundlé dans Expo Go** : testable sans build ; le plugin d'`app.json` ne sert
qu'aux builds natifs.
Commandes de l'écran : déclencheur, bascule avant/arrière, flash (auto/on/off) et **zoom au
curseur** (`@react-native-community/slider`, prop `zoom` de `CameraView`, 0 → 1). Pas de pincement :
`react-native-gesture-handler` n'est pas une dépendance du projet et les gestes sont évités (même
raison que `CropModal`). Le zoom et `ready` sont **réinitialisés à chaque ouverture** — la
prévisualisation est démontée à la fermeture, un `ready` resté vrai autoriserait un déclenchement
avant `onCameraReady`.

## Voir une photo en grand
La vignette de `PhotoCard` fait 76 px : **toucher la vignette** ouvre
`src/components/PhotoViewerModal.tsx` (plein écran noir, photo `resizeMode="contain"`, commentaire
en bas). Toucher le **reste de la carte** garde l'ancien comportement — ouverture de `CommentModal`.
Le zoom utilise les props natives de `ScrollView` (`minimumZoomScale` / `maximumZoomScale`), donc
sans `react-native-gesture-handler` ; ⚠️ **iOS uniquement** — sur Android la photo s'affiche en plein
écran mais ne se pince pas. Les pages de texte n'ouvrent pas la visionneuse.

## Petits modules à connaître
`src/appVersion.ts` `versionLabel()` — étiquette affichée en bas de `WelcomeScreen` : numéro d'app
(`app.json`) **+ horodatage et fin d'identifiant de l'EAS Update chargé**. Le numéro de TestFlight
ne bouge **pas** quand un update remplace le JS : sans ce repère, impossible de dire à un testeur si
la correction publiée est bien celle qu'il a sous les yeux. Prendre la **fin** de l'`updateId` (UUID
ordonnés par le temps : leurs premiers caractères sont identiques d'un update à l'autre).
**`applyLatestUpdate`** (même fichier, lancé par `WelcomeScreen`) : vérifie, télécharge et
**recharge** sur la dernière update pendant l'écran d'accueil — sans lui, une update n'arrivait
qu'au lancement suivant, et un build TestFlight fraîchement installé tournait sur son JS gravé,
plus ancien que les updates (vécu au build 7 : « choix des cartes » disparu). Jamais de rechargement
après « Commencer ». `Updates.isEmbeddedLaunch` → mention « version intégrée » (bundle gravé dans le build, ou retour
arrière après un update défaillant) ; en Expo Go `expo-updates` est inerte, d'où le `try/catch` ·
`saveToPhotoLibrary()` (`src/mediaLibrary.ts`) renvoie `false` si la permission est refusée —
l'ajout à l'album ne doit jamais échouer pour autant.

## Le dossier `docs/` (site public, exigé par les stores)
Trois fichiers, tous **obligatoires** une fois publiés — les supprimer casse quelque chose ailleurs :
- `index.html` : page d'installation visée par `INSTALL_URL` (`src/links.ts`).
- `privacy.html` : politique de confidentialité. **Apple et Google exigent cette URL** pour toute
  fiche d'app. Contenu aligné sur le fonctionnement réel : aucune collecte, stockage local,
  géocodage délégué au service du système, partage à l'initiative de l'utilisateur, correcteur
  hors ligne. La mettre à jour si une fonction se met à envoyer quoi que ce soit sur un réseau.
- `google<hash>.html` : preuve de propriété **Google Search Console**, exigée par la validation du
  site déclaré dans le compte développeur Play. Google revérifie périodiquement : le retirer fait
  perdre la validation du compte.

## Identité de l'app
`slug` **`photo-album-print`** (historique) mais l'app s'appelle **ComClic**. Ne pas « corriger » le slug : il identifie le projet
côté EAS (builds, updates, canal `preview`).

## Commits
Messages **en français**, préfixe conventionnel quand il s'applique (`feat:`, `fix:`, `docs:`,
`chore:`), sujet centré sur l'effet utilisateur. Exemples du dépôt : `feat: envoyer/recevoir un album
entre utilisateurs ComClic`, `docs: documenter le downscale des photos dans le PDF (readPrintBase64)`.

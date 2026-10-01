# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Expo SDK 54** (React Native 0.81, React 19). The API surface changed significantly in
> recent SDKs — always confirm against https://docs.expo.dev/versions/v54.0.0/ before writing code.

## Commands

```bash
npm start              # Démarre Metro (⚠️ plus utilisable depuis Expo Go, cf. ci-dessous)
npm run ios            # Ouvre dans le simulateur iOS
npm run android        # Ouvre sur Android
npx tsc --noEmit       # Vérification de types (pas de script lint/test dans ce projet)
npx expo-doctor        # Cohérence des versions natives avec le SDK (18 contrôles)
```

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
**▲▼** dans `PhotoCard` (le glisser-déposer a été retiré : incompatible avec Reanimated 4). La
**photo de couverture** se choisit via l'**étoile** ★ de `PhotoCard` (`onSetCover`, une seule par
dossier ; sinon la 1ʳᵉ photo sert de couverture par défaut).

**Fichiers image, réglages & recadrage** (`src/photoFiles.ts`, `src/adjustments.ts`,
`src/components/CropModal.tsx`) : les URI de la caméra/galerie sont temporaires → `persistImage()`
**copie** vers `documentDirectory/album-photos/`. ⚠️ l'import est `expo-file-system/legacy`.
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
  **feuille de partage native iOS** (`expo-sharing`). Un **ZIP** passe par Mail/AirDrop/Fichiers, **pas**
  Messenger/WhatsApp.
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
  (`short`/`shortTime`/`long`/`full`/`none`), **dateAlign** et **textAlign** (gauche/centre/droite ;
  `textAlign` = alignement des **pages de texte**, honoré en pro **et** familial). Le **`style`**
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
  de couverture** = titre + année (`yearLabel`, calculée sur les photos) + **la seule photo de
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
- `PreviewModal` rend **le même HTML** dans une **WebView**. L'envoi JPEG : `src/pageImages.ts`
  compose chaque page en **Skia** (déterministe, hors-ligne — la capture de WebView est peu fiable
  sur iOS) ; plusieurs pages → **ZIP** (`src/albumZip.ts`, `jszip`).
- Contraintes de mise en page PDF **à ne pas casser** : dimensionner en **px = points** (A4
  595×842), **jamais de `vh`**, **hauteurs fixes** en familial (pas de flex vertical), et
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
- Ajouts : `react-native-webview` (aperçu), `expo-location` (lieu), `jszip` (ZIP d'export et
  `.comclic`), `talisman` (phonétique FR), `@expo/vector-icons` (icônes), `expo-font` (polices du
  thème), `expo-image-manipulator` (recadrage), `@shopify/react-native-skia` (accueil + rendu JPEG
  des pages), `@react-native-community/slider` (réglages d'image), `expo-updates` (EAS Update).
  Toutes épinglées sur `node_modules/expo/bundledNativeModules.json` (SDK 54).
- **Modules natifs absents d'Expo Go** — ne se valident que sur un build EAS : `expo-share-intent`
  (import par partage système), `expo-speech-recognition` (dictée). Le code doit rester **tolérant**
  à leur absence (provider no-op, bouton non monté), sinon Expo Go crashe au lancement.
- `react-native-reanimated` / `react-native-worklets` sont **présents mais plus utilisés** (restes
  du glisser-déposer supprimé) — sûrs à retirer si besoin.
- `src/frenchPhonetic.json` est un **asset généré de ~5,9 Mo** (bundle ~15 Mo, premier chargement
  plus long) : ne pas le supprimer ; régénérable par un script node (talisman + `an-array-of-french-words`).
- `src/montserratFonts.ts` = **~0,9 Mo** de base64 (graisses 500 + 800), généré une fois depuis
  `@expo-google-fonts/montserrat`.
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
`HomeScreen` filtre et trie la liste avant de la passer à la `FlatList` (`visibleAlbums`) :
**recherche** sur le nom via `normalizeSearch()` (minuscules **et sans accents** — `NFD` puis
suppression des diacritiques, pour que « ete » trouve « Été ») et **tri** par `AlbumSort`
(`recent` = `createdAt` décroissant, `name` = `localeCompare` avec `localeTag(lang)`, `size` =
**poids réel des fichiers** décroissant). Le poids vient de `fileSize()` (`photoFiles.ts`,
`getInfoAsync`) : chaque photo n'est mesurée **qu'une fois** — l'effet n'interroge que les `id`
absents de `sizeByPhoto`, donc ajouter une photo ne relance pas de balayage complet. Le total par
dossier ignore les `originalUri` conservés pour la ré-édition : c'est le poids de l'album, pas
l'occupation disque. Affichage via `formatBytes()` (`src/fileSize.ts`, unités Ko/Mo/Go ou KB/MB/GB). Le tri est persisté (`album.sort.v1`, `loadAlbumSort` /
`saveAlbumSort`) ; le texte cherché ne l'est pas. Le nombre de photos par dossier vient d'une `Map`
mémoïsée sur `photos` — la liste est plate, un `filter` par carte serait quadratique. L'état vide
distingue « aucun dossier » de « aucun résultat ».

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
après chaque déclenchement. `expo-image-picker` reste utilisé pour l'**import galerie**.
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
`Updates.isEmbeddedLaunch` → mention « version intégrée » (bundle gravé dans le build, ou retour
arrière après un update défaillant) ; en Expo Go `expo-updates` est inerte, d'où le `try/catch` ·
`src/id.ts` `newId()` (identifiants `timestamp-suffixe`, utilisé pour photos, dossiers et noms de
fichiers persistés) · `src/mediaLibrary.ts` `saveToPhotoLibrary()` (copie dans l'app Photos, permission
**écriture seule**, renvoie `false` si refusée — l'ajout à l'album ne doit jamais échouer pour autant)
· `src/dateFormat.ts` `photoDate()` (prise de vue réelle sinon date d'ajout) et le rendu des cinq
`DateFormat`.

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
`app.json` : `slug` **`photo-album-print`** (historique) mais l'app s'appelle **ComClic** ;
`scheme` `comclic` ; `owner` = organisation **`boccaras-team`** ; `ios.bundleIdentifier` =
`android.package` = `com.boccarasteam.comclic`. Ne pas « corriger » le slug : il identifie le projet
côté EAS (builds, updates, canal `preview`).

## Commits
Messages **en français**, préfixe conventionnel quand il s'applique (`feat:`, `fix:`, `docs:`,
`chore:`), sujet centré sur l'effet utilisateur. Exemples du dépôt : `feat: envoyer/recevoir un album
entre utilisateurs ComClic`, `docs: documenter le downscale des photos dans le PDF (readPrintBase64)`.

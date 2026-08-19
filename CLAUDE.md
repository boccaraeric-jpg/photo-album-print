# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Expo SDK 54** (React Native 0.81, React 19). The API surface changed significantly in
> recent SDKs — always confirm against https://docs.expo.dev/versions/v54.0.0/ before writing code.

## Commands

```bash
npm start              # Démarre Metro (Expo Go) — scanner le QR depuis l'iPhone
npm run ios            # Ouvre dans le simulateur iOS
npm run android        # Ouvre sur Android
npx tsc --noEmit       # Vérification de types (pas de script lint/test dans ce projet)
```

Il n'y a **ni tests, ni linter, ni CI** — `tsc --noEmit` est la seule vérification statique.
L'app se valide **manuellement dans Expo Go sur un iPhone**. Boucle de validation côté PC :
`npx expo start --clear` puis `curl "http://localhost:8081/index.bundle?platform=ios&dev=true"`
(HTTP 200 = le bundle compile ; c'est là que sortent les erreurs d'import/transform).
- ⚠️ Si le **port 8081 est déjà pris** par un autre projet, `npx expo start` s'arrête en mode non
  interactif (« Input is required… › Skipping dev server ») : démarrer avec `--port 8082` et
  interroger le bundle sur ce port. Vérifier **quel** projet occupe le port avant de tuer quoi que
  ce soit : `netstat -ano | grep :8081` puis `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"`.
- Bundle HTTP 200 ne prouve pas que l'iPhone a le nouveau code : contrôler que le **log Metro**
  montre bien un bundle servi à l'appareil, ou chercher une chaîne neuve dans le bundle téléchargé.
  Un appareil resté sur EAS Update / une vieille URL sert silencieusement l'ancienne version.

### Connexion Expo Go (pièges récurrents)
- Après **tout** `npm/expo install`, arrêter Metro et relancer avec `npx expo start --clear`.
- « Même wifi mais ça ne charge plus » : le PC sert bien (bundle HTTP 200 en local) ; côté iPhone
  c'est en général une **IP DHCP qui a changé** OU le **pare-feu Windows en profil « Public »** qui
  bloque le port 8081. Contournement fiable = **tunnel** : `npx expo start --tunnel` (passe par
  internet, ignore IP/pare-feu). Récupérer l'URL tunnel via l'API ngrok locale
  `http://localhost:4040/api/tunnels` (host `*.exp.direct`), puis générer un QR de `exp://<host>`
  (paquet `qrcode` installé en `--no-save` le temps de générer, cf. plus bas).
- Épingler les paquets natifs aux versions de `node_modules/expo/bundledNativeModules.json`
  (Expo Go embarque des versions natives figées) : installer via `npx expo install`.
- **Débloquer le LAN sans tunnel** (quand le tunnel ngrok plante, cf. `ERR_NGROK_3200` /
  `Cannot read properties of undefined (reading 'body')`) : passer le wifi en **profil « Privé »**
  (Paramètres Windows, pas admin) **puis** autoriser le port en entrée — commande **admin** :
  `New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private`.
  Le profil Privé seul ne suffit pas si l'action entrante par défaut est « bloquer ».
- **Le QR/adresse LAN (`exp://192.168.x.x:8081`) ne marche QUE pour un appareil sur le même wifi.**
  Une IP `192.168.*` est privée : injoignable depuis la 5G ou un autre réseau → « Internet
  connection appears to be offline ». Pour un testeur **hors du wifi**, il faut le **tunnel** ou
  **EAS Update** (cf. ci-dessous), jamais le LAN.
- Piège : dans Expo Go, l'entrée **« Recently opened »** rejoue une **vieille URL tunnel**
  (`*.exp.direct`) même après passage en LAN → scanner le QR neuf / saisir l'URL à la main.

### Partage aux testeurs (EAS Update)
- Projet `@boccaras-team/photo-album-print` (propriété de l'**organisation** `boccaras-team` ;
  `owner` dans `app.json` ; le compte perso est `boccara`), canal **`preview`** :
  `npx eas-cli update --branch preview --message "..."`.
- `runtimeVersion` doit rester `{ "policy": "sdkVersion" }` dans `app.json` (la politique
  `appVersion` casse le chargement dans Expo Go).
- ⚠️ **Depuis le 12 mai 2026, Expo Go ne charge un projet EAS Update que pour un compte membre du
  propriétaire.** Rendre le projet public n'y change rien. Un testeur doit être invité en **Viewer**
  dans l'org `boccaras-team`, accepter l'email **avec l'adresse exacte de l'invitation** (pas de
  « Se connecter avec Apple/Google » qui crée un autre email), puis se connecter dans Expo Go avec
  ce compte avant de scanner le QR. Sinon : `HTTP 403 ... requires authentication`.

### Build natif & TestFlight (EAS Build)
- Expo Go **ne va pas** sur TestFlight (bac à sable dev). Pour Apple : un **build `.ipa`** via EAS Build.
- `app.json` : `ios.bundleIdentifier` = `android.package` = `com.boccarasteam.comclic`.
- `eas.json` : profils `development` / `preview` (`distribution: internal`) / `production`
  (`autoIncrement`, `appVersionSource: remote`). TestFlight = profil **`production`**.
- Flux : `eas build --platform ios --profile production` puis
  `eas submit --platform ios --profile production --latest` → App Store Connect → TestFlight.
- ⚠️ Les réglages **natifs** (ex. `CFBundleLocalizations` FR dans `app.json.ios.infoPlist`, qui
  traduisent les boutons caméra et le menu Coller/Sélectionner en français) n'arrivent **que par un
  build**, jamais par un EAS Update (OTA = JS uniquement).

## Architecture

Application **mono-écran sans bibliothèque de navigation** : `App.tsx` détient tout l'état et
bascule entre chargement / `HomeScreen` (liste des dossiers) / `AlbumScreen` (photos d'un dossier)
selon `openAlbumId`. Tout se joue par superposition de modaux (`src/components/*Modal.tsx`). Au
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
`finishImport` ouvre le dossier. ⚠️ Module **natif** : en Expo Go `hasShareIntent` reste faux (le
provider est no-op) — ce flux ne se teste que sur un build EAS.

**Dictée vocale** (`expo-speech-recognition`, `src/components/VoiceCommentButton.tsx`) :
reconnaissance **on-device** (iOS `SFSpeechRecognizer`) dans la langue courante de l'app ; la dictée
**s'ajoute** au commentaire existant (résultats partiels en direct, phrases finales figées). Là
encore **natif** : `CommentModal` ne monte le bouton que si la reconnaissance est disponible, donc
invisible dans Expo Go.

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
  (ZIP + manifeste) à un ami qui a l'app. Les photos sont **redimensionnées/recompressées** via
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
- `ExportOptions` (`src/types.ts`) : **taille** (`small`/`medium`/`large`/**`full`** = pleine page,
  légende ≤ 15 mots), fond, encadré, **liseré** (posé sur la photo, pas le support), **dateFormat**
  (`short`/`shortTime`/`long`/`full`/`none`), **dateAlign** et **textAlign** (gauche/centre/droite ;
  `textAlign` = alignement des **pages de texte**, honoré en pro **et** familial). Le **`style`**
  (`family`/`pro`) vient des boutons du bas. La date sous chaque photo est rendue en **minuscules**,
  taille réduite.
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

**Lieu de prise de vue** (`src/exif.ts`, `src/photoLocation.ts`, `src/geocode.ts`) : le GPS EXIF est
**souvent absent** (PHPicker iOS le retire) → `resolveCoords()` tente EXIF, puis `expo-media-library`
via `assetId`, puis (photo prise dans l'app) la **position de l'appareil** (`expo-location`).
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
  Toutes épinglées pour Expo Go.
- **Modules natifs absents d'Expo Go** — ne se valident que sur un build EAS : `expo-share-intent`
  (import par partage système), `expo-speech-recognition` (dictée). Le code doit rester **tolérant**
  à leur absence (provider no-op, bouton non monté), sinon Expo Go crashe au lancement.
- `react-native-reanimated` / `react-native-worklets` sont **présents mais plus utilisés** (restes
  du glisser-déposer supprimé) — sûrs à retirer si besoin.
- `src/frenchPhonetic.json` est un **asset généré de ~5,9 Mo** (bundle ~15 Mo, premier chargement
  plus long) : ne pas le supprimer ; régénérable par un script node (talisman + `an-array-of-french-words`).
- `src/montserratFonts.ts` = **~0,9 Mo** de base64 (graisses 500 + 800), généré une fois depuis
  `@expo-google-fonts/montserrat`.
- **Icônes** (« icône v7 » : **monogramme « CC » de ComClic seul**, sienne, sur crème, avec les
  cercles de visée — deux arcs ouverts à droite, centres x 338 et 686 / y 512, r 166,
  `stroke-width: 84`, dimensionnés pour **remplir le cercle de visée extérieur**). Historique utile :
  v2 = **dossier** ; v3 = appareil photo détaillé mais **chevron** masquant l'objectif ; v4 = chevron
  réduit en badge (refusé) ; v5 = chevron agrandi ; v6 = chevron remplacé par le **double C** (il ne
  disait rien du nom de l'app) sur fond d'appareil photo ; **v7 = appareil photo retiré**, il
  alourdissait le dessin. ⚠️ **Ne pas rapprocher les deux C** : centres trop proches, les arcs
  s'enchevêtrent et le sigle devient une tache illisible (essayé). Les sources sont **vectorielles et versionnées** dans `design/` :
  `icon.svg` (visuel complet, fond crème bord à bord), `icon-foreground.svg` (visuel seul à 66 %,
  transparent, zone sûre Android), `icon-monochrome.svg` (« CC » plein en noir, teinté par Android),
  `logo-mark.svg` (**marque seule**, transparente, sans cercles de visée).
  `node design/build-icons.js` régénère **tous** les PNG d'`assets/` : `icon.png` (1024, iOS — carré
  plein, le masque arrondi est celui d'iOS), `welcome-logo.png` (512, arrondi par le `borderRadius`
  du style), `favicon.png`, `android-icon-foreground.png`, `android-icon-monochrome.png`,
  `logo-mark.png` (256) et l'aplat `android-icon-background.png` (**`#FBF4EA`** = crème intérieure,
  aussi dans `app.json` `adaptiveIcon.backgroundColor`). Retoucher le dessin = éditer le SVG puis
  relancer le script, jamais repartir d'un JPEG. ⚠️ Ces icônes **n'apparaissent que dans un build
  natif** — dans Expo Go l'app porte l'icône d'Expo Go.
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
  **Metro arrêté**, ou le relancer ensuite.

## Prise de photo
`＋ Nouvelle photo` ouvre **`src/components/CameraModal.tsx`** (`expo-camera`, `CameraView`), pas la
caméra système. Raison : `ImagePicker.launchCameraAsync()` déclenche l'écran iOS **« Use Photo /
Retake »**, que l'API n'expose aucun moyen de sauter ; il faisait doublon avec la suppression depuis
le dossier. Le déclencheur renvoie la photo **immédiatement** à `onCapture` (App.tsx), qui garde le
pipeline d'avant : `saveToPhotoLibrary()` → `getCurrentCoords()` (une capture n'a pas de GPS EXIF) →
`addAsset()` → éditeur de commentaire. `expo-image-picker` reste utilisé pour l'**import galerie**.
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
`src/id.ts` `newId()` (identifiants `timestamp-suffixe`, utilisé pour photos, dossiers et noms de
fichiers persistés) · `src/mediaLibrary.ts` `saveToPhotoLibrary()` (copie dans l'app Photos, permission
**écriture seule**, renvoie `false` si refusée — l'ajout à l'album ne doit jamais échouer pour autant)
· `src/dateFormat.ts` `photoDate()` (prise de vue réelle sinon date d'ajout) et le rendu des cinq
`DateFormat`.

## Identité de l'app
`app.json` : `slug` **`photo-album-print`** (historique) mais l'app s'appelle **ComClic** ;
`scheme` `comclic` ; `owner` = organisation **`boccaras-team`** ; `ios.bundleIdentifier` =
`android.package` = `com.boccarasteam.comclic`. Ne pas « corriger » le slug : il identifie le projet
côté EAS (builds, updates, canal `preview`).

## Commits
Messages **en français**, préfixe conventionnel quand il s'applique (`feat:`, `fix:`, `docs:`,
`chore:`), sujet centré sur l'effet utilisateur. Exemples du dépôt : `feat: envoyer/recevoir un album
entre utilisateurs ComClic`, `docs: documenter le downscale des photos dans le PDF (readPrintBase64)`.

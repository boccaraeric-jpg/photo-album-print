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
- Les deux boutons du bas sont **Privé** (familial) et **Professionnel**. **Les deux** ouvrent
  `ExportModal` (mise en page) → « Aperçu » → `PreviewModal` → envoi. En **pro**, `ExportModal`
  n'affiche qu'une note + le réglage d'**alignement du texte** (le reste du gabarit est imposé).
- Le pop-up format (`chooseFormat`) a **trois options** : **PDF** (`sendPdf`), **Images de l'album**
  (`sendImages` = le rendu mis en page, 1 image/page → ZIP si plusieurs), et **Photos (à réutiliser)**
  (`sendReusablePhotos` → `zipPhotos` dans `albumZip.ts` = ZIP des **fichiers photo affichés** pleine
  résolution + un `contexte.txt` listant commentaire/date/lieu de chaque photo). Chacune ouvre la
  **feuille de partage native iOS** (`expo-sharing`). Un **ZIP** passe par Mail/AirDrop/Fichiers, **pas**
  Messenger/WhatsApp.
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
- `src/pdf.ts` `buildAlbumHtml()` (familial) / `buildProDocument()` (pro, photos numérotées,
  Lieu / Date / Description, pages de texte intercalées, flux `page-break-inside: avoid`). La **1ère
  de couverture** = titre + année (`yearLabel`, calculée sur les photos) + **la seule photo de
  couverture** + repères de coupe. La photo de couverture n'est **pas** répétée dans les pages
  **sauf si elle porte un commentaire** (familial ; le pro n'a pas de photo en couverture).
  `htmlToPdfFile()` rend via `expo-print` puis **renomme**
  (`albumFileBase` = « NomAlbum JJ-MM-AAAA »).
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

## Dépendances & assets à connaître
- Ajouts : `react-native-webview` (aperçu), `expo-location` (lieu), `jszip` (export multi-images),
  `talisman` (phonétique FR), `@expo/vector-icons` (icônes), `expo-font` (polices du thème),
  `expo-image-manipulator` (recadrage). Toutes épinglées pour Expo Go.
- `react-native-reanimated` / `react-native-worklets` sont **présents mais plus utilisés** (restes
  du glisser-déposer supprimé) — sûrs à retirer si besoin.
- `src/frenchPhonetic.json` est un **asset généré de ~5,9 Mo** (bundle ~15 Mo, premier chargement
  plus long) : ne pas le supprimer ; régénérable par un script node (talisman + `an-array-of-french-words`).
- `src/montserratFonts.ts` = **~0,9 Mo** de base64 (graisses 500 + 800), généré une fois depuis
  `@expo-google-fonts/montserrat`.
- **Icônes** (« icône v2 », dossier + chevron sienne sur crème) : `assets/icon.png` (iOS, carré plein
  bord à bord — recadré **à l'intérieur** des coins arrondis de la source pour que le masque iOS soit
  le seul arrondi), `assets/android-icon-foreground.png` (visuel à 66 %, zone sûre Android),
  `assets/android-icon-background.png` (aplat **`#FBF4EA`** = crème intérieure de l'icône, aussi dans
  `app.json` `adaptiveIcon.backgroundColor`). `assets/welcome-logo.png` (512 px) = **même visuel**,
  arrondi par le `borderRadius` du style, pas rôgné. Tous générés avec `sharp` depuis
  `Bureau/icone v2.jpg`. ⚠️ Ces icônes **n'apparaissent que dans un build natif** — dans Expo Go
  l'app porte l'icône d'Expo Go.
- **Outils PC uniquement, jamais dans les deps RN** : `sharp` (génération icônes + logo), `qrcode`
  (QR Expo Go), `@expo-google-fonts/montserrat` (extraction des TTF pour le base64). Les installer en
  **`npm install <pkg> --no-save`**, générer, puis **nettoyer** : `npm uninstall <pkg> --no-save` et
  au besoin `rm -rf node_modules/<pkg>` ; **vérifier** que `package.json` est inchangé
  (`diff` avec une copie avant install). La skill de design vit dans `.agents/skills/` (non suivi,
  hors commits, comme les notes `*.doc` et `skills-lock.json`).

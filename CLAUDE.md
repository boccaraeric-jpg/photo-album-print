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
- « Même wifi mais ça ne charge plus » : le PC sert bien, c'est en général une **IP DHCP qui a
  changé** (rescanner le QR vivant, jamais un PNG figé). Fallback : `npx expo start --tunnel`.
- Épingler les paquets natifs aux versions de `node_modules/expo/bundledNativeModules.json`
  (Expo Go embarque des versions natives figées) : installer via `npx expo install`.

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

## Architecture

Application **mono-écran sans bibliothèque de navigation** : `App.tsx` détient tout l'état et
bascule entre chargement / `HomeScreen` (liste des dossiers) / `AlbumScreen` (photos d'un dossier)
selon `openAlbumId`. Tout se joue par superposition de modaux (`src/components/*Modal.tsx`).

**Données & persistance** (`src/types.ts`, `src/storage.ts`) : un `Album` (dossier) regroupe des
`Photo` stockées en **liste plate globale** (appartenance via `Photo.albumId`, filtrage à
l'affichage ; un export = un dossier). Tout l'état vit dans `useState` au niveau de `App`, réécrit
dans **AsyncStorage** par des `useEffect` à chaque changement (clés `*.v1`). `loadData()` migre les
anciennes données et **normalise `Photo.order`** (rang contigu par dossier). L'ordre d'affichage
suit `comparePhotos` (`order`, sinon `createdAt`) ; le **réordonnancement** se fait par boutons
**▲▼** dans `PhotoCard` (le glisser-déposer a été retiré : incompatible avec Reanimated 4).

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
- **Familial** → ouvre `ExportModal` (mise en page) → « Aperçu » → `PreviewModal` → « Partager
  l'album » → pop-up **PDF / JPEG**.
- **Professionnel** → va **directement** à `PreviewModal` (gabarit sobre imposé) → « Envoyer » →
  pop-up format.
- `ExportModal` = `ExportOptions` du mode familial : **taille** (`small`/`medium`/`large`/**`full`**
  = pleine page bord à bord, légende ≤ 15 mots), fond, encadré, **liseré** (option additive posée
  sur la photo, pas sur le support), format de date. Le **`style`** (`family`/`pro`) est piloté par
  les boutons du bas, pas dans le modal.
- **Types d'entrées** : une `Photo` est soit une image, soit une **page de texte** (`kind: 'text'`,
  `uri` vide, `comment` = le texte) créée par « ＋ Page de texte ». `src/paginate.ts`
  `paginateEntries()` renvoie des `AlbumPage` (`photos` groupées | `text` autonome) ; les pages de
  texte s'intercalent dans **les deux** rendus.
- `src/pdf.ts` `buildAlbumHtml()` (familial) / `buildProDocument()` (pro, photos numérotées,
  Lieu / Date / Description, pages de texte intercalées, flux `page-break-inside: avoid`). La **1ère
  de couverture** = titre + année (`yearLabel`, calculée sur les photos) + **la seule photo de
  couverture** + repères de coupe. `htmlToPdfFile()` rend via `expo-print` puis **renomme**
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
deux Modal imbriqués. Le correcteur natif iOS (`spellCheck`/`autoCorrect`) est **désactivé** sur les
champs pour ne pas parasiter.

**Thème « Chambre Claire »** (`src/theme.ts`) : palette **crème / encre / terre de Sienne** (objet
`C`) et polices (objet `F`) — titres **Gloock** (serif display), labels **IBM Plex Mono**. Les 3
`.ttf` sont dans `assets/fonts/`, chargés au démarrage via `useFonts` d'`expo-font` dans `App()`
(l'app rend un écran crème tant que les polices ne sont pas prêtes). Réutiliser `C`/`F` pour tout
nouveau style plutôt que de re-hardcoder des hex. Le PDF/JPEG utilise Georgia (serif système) car on
n'embarque pas Gloock dans le HTML.

## Dépendances & assets à connaître
- Ajouts : `react-native-webview` (aperçu), `expo-location` (lieu), `jszip` (export multi-images),
  `talisman` (phonétique FR), `@expo/vector-icons` (icônes), `expo-font` (polices du thème),
  `expo-image-manipulator` (recadrage). Toutes épinglées pour Expo Go.
- `react-native-reanimated` / `react-native-worklets` sont **présents mais plus utilisés** (restes
  du glisser-déposer supprimé) — sûrs à retirer si besoin.
- `src/frenchPhonetic.json` est un **asset généré de ~5,9 Mo** (bundle ~15 Mo, premier chargement
  plus long) : ne pas le supprimer ; régénérable par un script node (talisman + `an-array-of-french-words`).
- Outils **PC uniquement** (génération d'images/affiches hors app) comme `sharp`/`@resvg/resvg-js` :
  toujours les **désinstaller** après usage et `git checkout package.json` — ils ne doivent pas
  entrer dans les dépendances de l'app RN. La skill de design vit dans `.agents/skills/` (non suivi).

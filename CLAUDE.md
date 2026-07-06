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

There is **no test suite, linter, or CI** configured — `tsc --noEmit` is the only static
check. The app is validated manually in Expo Go on a physical iPhone.

### Connexion Expo Go (pièges récurrents)
- Après **tout** `npm/expo install`, arrêter Metro et relancer avec `npx expo start --clear`
  (sinon « Unable to resolve module »).
- Si le LAN ne joint plus le téléphone (« même wifi mais ça ne charge pas ») : le PC sert bien,
  c'est en général une **IP DHCP qui a changé** (rescanner le QR vivant, jamais un PNG figé).
  Fallback infaillible : `npx expo start --tunnel` (`@expo/ngrok` est installé globalement).
- Valider un bundle côté PC : `curl "http://localhost:8081/index.bundle?platform=ios&dev=true"` (200 = OK).

### Partage aux testeurs (EAS Update)
- Projet `@boccaras-team/photo-album-print` (propriété de l'**organisation** `boccaras-team`,
  `owner` dans `app.json` ; le compte perso est `boccara`), canal **`preview`** :
  `npx eas-cli update --branch preview --message "..."`.
- `runtimeVersion` doit rester `{ "policy": "sdkVersion" }` dans `app.json` — la politique
  `appVersion` casse le chargement dans Expo Go.
- ⚠️ **Depuis le 12 mai 2026, Expo Go ne charge un projet EAS Update que pour un compte membre
  du propriétaire** (voir changelog Expo). Rendre le projet **public n'y change rien**. Un testeur
  externe qui scanne le QR sans être membre obtient `HTTP 403 ... requires authentication` (alors
  que `u.expo.dev/<projectId>` répond pourtant 200 en anonyme). Le partage passe donc par :
  inviter le testeur en **Viewer** dans l'org `boccaras-team`, il accepte l'email et **se connecte
  dans Expo Go avec ce compte**, puis scanne le QR.

## Architecture

Application mono-écran sans bibliothèque de navigation : **`App.tsx`** détient tout l'état et
bascule entre trois vues selon `openAlbumId` — chargement, `HomeScreen` (liste des dossiers),
`AlbumScreen` (photos d'un dossier). Les modaux (`src/components/*Modal.tsx`) se superposent.

**Modèle de données** (`src/types.ts`) : un `Album` (dossier) regroupe des `Photo`. Les photos
sont stockées en **liste plate globale** ; l'appartenance à un dossier passe par `Photo.albumId`,
le filtrage se fait à l'affichage. Un PDF est exporté **par dossier**.

**Persistance** (`src/storage.ts`) : tout l'état vit dans `useState` au niveau de `App` et est
réécrit dans **AsyncStorage** par des `useEffect` à chaque changement de `albums`/`photos`
(clés versionnées `*.v1`). `loadData()` gère une **migration** depuis l'ancienne version sans
dossiers (regroupe les photos orphelines dans un premier dossier).

**Fichiers image** (`src/photoFiles.ts`) : les URI de l'appareil photo / galerie sont temporaires,
donc `persistImage()` les **copie** dans `documentDirectory/album-photos/`. ⚠️ L'import est
`expo-file-system/legacy` — la nouvelle API FileSystem de SDK 54 n'est pas utilisée ici.

**Réglages d'image** (`src/adjustments.ts`) : les curseurs (-100..100) sont composés en une
**matrice couleur 4×5 Skia**. `AdjustModal` applique cette matrice en direct pour la prévisualisation
(Canvas Skia + `ColorMatrix`) ; à la sauvegarde, `bakeAdjustedImage()` **grave** le résultat
hors écran en un nouveau JPEG. La photo conserve alors `originalUri` (source intacte) + `uri`
(version gravée) + `adjustments` (pour ré-édition). Des réglages neutres reviennent à l'original
et suppriment le fichier gravé.

**Export PDF** (`src/pdf.ts`) : génère du **HTML** transformé en PDF via `expo-print`, puis ouvre
la feuille de partage iOS (`expo-sharing`). Le HTML produit une couverture, des pages photo
personnalisables (taille → 1/2/4 par page, fond, style d'encadré) et une page de fin.
Contraintes de mise en page apprises à la dure, **à ne pas casser** :
- Dimensionner en **px = points PDF** (page A4 = 595×842 à 72 dpi). **Jamais de `vh`** (dépend de
  la fenêtre du moteur de rendu → pages blanches et chevauchements).
- Utiliser des **hauteurs fixes**, jamais de flex vertical, pour que rien ne déborde sur la page suivante.
- `print-color-adjust: exact` est **indispensable** : sinon iOS supprime fonds et ombres du PDF.

## Versions natives figées (Expo Go)
Expo Go embarque des versions natives figées. Aligner les versions JS sur
`node_modules/expo/bundledNativeModules.json`. En particulier **`react-native-worklets` doit
rester `0.5.1`** (reanimated tire sinon une 0.8.x incompatible, masquée par Skia derrière
« react-native-reanimated is not installed! »).

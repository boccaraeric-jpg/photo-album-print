# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Expo SDK 54** (React Native 0.81, React 19). The API surface changed significantly in
> recent SDKs — always confirm against https://docs.expo.dev/versions/v54.0.0/ before writing code.

**ComClic** (slug historique `photo-album-print`) : app iOS/Android qui range des photos commentées
en dossiers et les exporte en album mis en page (PDF, images, ZIP, fichier `.comclic`). Hors ligne,
sans serveur.

> 📖 **Le détail de chaque fonction est dans [`ARCHITECTURE.md`](ARCHITECTURE.md)** — pourquoi c'est
> fait ainsi, pièges vécus, noms des fonctions. **Lire la section concernée avant de modifier une
> fonction** (export, dictée, sauvegarde, recadrage, partage entrant, achats…). Ce fichier-ci ne garde
> que la vue d'ensemble et les règles à ne pas casser. Toute nouvelle fonction : son détail va dans
> `ARCHITECTURE.md`, et seulement une règle transversale ici.

## Commands

Il n'y a **ni tests, ni linter, ni CI** — `npx tsc --noEmit` est la seule vérification statique.

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
(`platform=android` pour Android ; HTTP 200 = le bundle compile ; c'est là que sortent les erreurs
d'import/transform). Arrêter Metro ensuite.
- ⚠️ Si le **port 8081 est déjà pris** par un autre projet, `npx expo start` s'arrête en mode non
  interactif (« Input is required… › Skipping dev server ») : démarrer avec `--port 8082` et
  interroger le bundle sur ce port. Vérifier **quel** projet occupe le port avant de tuer quoi que
  ce soit : `netstat -ano | grep :8081` puis `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"`.
- Bundle HTTP 200 ne prouve pas que l'iPhone a le nouveau code : contrôler que le **log Metro**
  montre bien un bundle servi à l'appareil, ou chercher une chaîne neuve dans le bundle téléchargé.
  Un appareil resté sur EAS Update / une vieille URL sert silencieusement l'ancienne version.
- Sur l'appareil, l'étiquette en bas de `WelcomeScreen` (`versionLabel()`) finit par la **fin de
  l'`updateId`** chargé : c'est ce qu'on demande au testeur pour savoir s'il a la dernière update.

### Publication (détail dans `PUBLICATION.md`)
`PUBLICATION.md` (racine, **pas** dans `docs/` qui est public via GitHub Pages) détaille EAS Update,
EAS Build / TestFlight, Google Play et les pièges de connexion. L'essentiel :
- **JS seulement** → `npx eas-cli update --branch production --message "..."` (canal du build
  TestFlight ; `preview` = builds internes ; se tromper de canal ne remonte aucune erreur).
- **Natif** (paquet natif, `app.json` `infoPlist`/plugins/permissions, icônes, `locales/*.json`,
  module Swift `modules/comclic-map`) → **nouveau build** obligatoire :
  `eas build --platform ios|android --profile production`. Un EAS Update n'y peut rien.
- `runtimeVersion` reste `{ "policy": "sdkVersion" }` dans `app.json`.
- ⚠️ **Épingler les paquets natifs sur la dist-tag du SDK, pas sur `latest`** : `npm install <pkg>`
  prend `latest` (SDK suivant), le plugin tourne mais **l'autolinking ne l'embarque pas** — vécu avec
  `expo-speech-recognition` 56.0.1 (bonne version : **3.1.3**). Toujours
  `npx expo install <pkg>@<version-sdk>`, contrôler avec `npm view <pkg> dist-tags`.

## Vue d'ensemble

**Application mono-écran sans bibliothèque de navigation** : `App.tsx` (plus de 2 000 lignes) détient
tout l'état et bascule entre `WelcomeScreen` (accueil « ComClic », jusqu'à « Commencer ») / chargement
/ `HomeScreen` (liste des dossiers) / `AlbumScreen` (photos d'un dossier) selon `openAlbumId`.
⚠️ `Root`, `HomeScreen` et `AlbumScreen` sont des **fonctions d'`App.tsx`**, pas des fichiers de
`src/components/` : les chercher là. Tout le reste se joue par superposition de modaux
(`src/components/*Modal.tsx`).

- **Données** (`src/types.ts`, `src/storage.ts`) : des `Album` (dossiers) et une **liste plate
  globale** de `Photo` (appartenance par `Photo.albumId`). Une `Photo` est une image **ou** une page
  de texte (`kind: 'text'`). Tout l'état vit dans `useState` d'`App`, réécrit dans **AsyncStorage**
  par des `useEffect` (clés `*.v1`). Ordre d'affichage = `comparePhotos` (`order`, sinon
  `createdAt`) ; `loadData()` migre et normalise.
- **Fichiers image** (`src/photoFiles.ts`) : copiés sous `documentDirectory/album-photos/`. Une photo
  retouchée garde `originalUri` (source) + `uri` (version gravée : réglages, annotations) → tout
  reste ré-éditable ; un recadrage devient la nouvelle base.
- **Export, le cœur de l'app** : les deux boutons du bas d'`AlbumScreen` — **Loisir** (familial,
  `style: 'family'`) et **Professionnel** (`'pro'`) — ouvrent `ExportModal` (mise en page) →
  `PreviewModal` (aperçu WebView, interactif) → envoi par la feuille de partage native. **Deux moteurs
  de rendu pour le même album** : `src/pdf.ts` produit le **HTML** (aperçu + PDF via `expo-print`),
  `src/pageImages.ts` dessine les **images JPEG en Skia**. Pagination commune (`src/paginate.ts`),
  placements partagés (`src/albumStyle.ts`, `src/albumMap.ts`).
- **Échanges** : `.comclic` (= `Nom.comclic.zip`, manifeste `comclic-album`) entre utilisateurs, et
  sauvegarde complète (manifeste `comclic-backup`, `src/backup.ts`) ; reçus par le partage système
  (`expo-share-intent`) **ou** par le bouton « Importer un album reçu » (`expo-document-picker`), qui
  rejoignent le même chemin (`pendingImport` → `ShareImportModal`).
- **Saisie** : commentaire avec gras/souligné balisés dans la chaîne (`**…**`, `__…__`,
  `src/richText.ts`), dictée on-device (`VoiceCommentButton`), correcteur FR hors ligne
  (`src/spellcheck.ts`, index phonétique embarqué), lieu/date résolus depuis l'EXIF puis la
  photothèque (`src/photoLocation.ts`).
- **Achats** (`src/purchases.tsx`, `expo-iap` 3.4.13) : app gratuite + achats uniques ;
  `EntitlementProvider` donne le palier (`trial`/`light`/`full`).

## Règles à ne pas casser

Chacune a coûté un bug réel ; le récit est dans `ARCHITECTURE.md`.

**Export : parité des deux moteurs**
- Tout réglage d'export (`ExportOptions`) ou de mise en forme est honoré par **`pdf.ts` et
  `pageImages.ts`** : toucher l'un sans l'autre fait diverger l'aperçu/PDF des images envoyées.
  Placements (couvertures, carte des lieux, logo) **dans `albumStyle.ts` / `albumMap.ts` seulement**,
  jamais dans un seul moteur. Aléa = **graine** (`seedOf`), jamais `Math.random`.
- Tout nouveau réglage va dans une **rubrique existante** d'`ExportModal` **et** dans son résumé
  (`joinSummary`, `L.export.sum*`). Options persistées : `{ ...DEFAULT_EXPORT_OPTIONS, ...stored }` /
  `sanitizeExportOptions`. Ne **jamais** changer la valeur d'une couleur de fond existante (enregistrée
  dans les réglages).
- Gabarits PDF : **px = points** (largeur 595), **jamais de `vh`**, **hauteurs fixes** en familial,
  `print-color-adjust: exact`, `-webkit-text-size-adjust: 100%` sur `html`.
- Images dans le PDF/`.comclic` via **`readPrintBase64()`** (redimensionne + recompresse), **jamais**
  `readBase64(photo.uri)` sur l'original (PDF de ~190 Mo vécus). Seul « Photos (à réutiliser) » garde
  la pleine résolution.
- Commentaire redevenu texte nu (`contexte.txt`, noms de fichiers, `isLongComment`) → `stripMarks()`.

**Fichiers et données**
- ⛔ **iOS déplace le conteneur de l'app à chaque build** : jamais d'URI absolue persistée telle
  quelle. `loadData` recalcule par `rebaseImageUri` ; tout nouveau fichier durable vit sous un dossier
  de `documentDirectory` et se recalcule pareil. Import : `expo-file-system/legacy`.
- Une copie (duplication, import) **copie les fichiers** (`copyImage`) : `deleteImage` efface le
  disque, une URI partagée détruirait l'original.
- Plafonds assumés : `MAX_ALBUM_PHOTOS` = 100 par dossier (`src/limits.ts`), `MAX_BACKUP_PHOTOS` =
  200 (JSZip en mémoire + base64 : iOS tue l'app au-delà). Ne pas les lever sans écriture en flux.
- Une restauration **ajoute** des dossiers, ne remplace jamais rien.

**Interface (React Native)**
- iOS ne présente **pas deux `Modal` superposés** : surcouches en `<View>` (`SpellCheckModal`,
  panneaux d'`ExportModal`), et fermer le modal en cours avant l'écran d'achat (`showPaywall(…, true)`).
- **`fontWeight` est ignoré sur une police custom iOS** : choisir la clé `F` (`display` 800 / `mono`
  500 / `monoBold` 700, toutes Montserrat). Couleurs et polices via `C` / `F` de `src/theme.ts`.
- Gestes en **`PanResponder`** seulement (`CropModal`, `AnnotateModal`) : pas de
  `react-native-gesture-handler` ; `react-native-reanimated`/`worklets` présents mais inutilisés.
- Saisie : **une seule zone de texte à l'écran** pour le commentaire (bascule rendu ↔ `TextInput`),
  boutons de mise en forme en **`onPressIn`** au-dessus du champ (iOS vide la sélection avant `onPress`).
- i18n (`src/i18n.ts`) : `fr` et `en` ont **exactement les mêmes clés** (sinon erreur de compilation) ;
  dans React `useLang()`, hors React `lang` passé en paramètre. Japonais exclu (polices sans CJK).

**Modules natifs et plateformes**
- Le JS doit **tolérer l'absence d'un module natif** (anciens builds atteints par une update) :
  `require` protégé pour la dictée, provider no-op pour le partage, **module d'achat absent ⇒ tout
  débloqué**. Ne pas conditionner la dictée à `isRecognitionAvailable()` (faux avant autorisation).
- Ces flux ne se testent que sur un build EAS : partage entrant, dictée, achats, cartes Apple Plans
  (`modules/comclic-map`, iOS seul ; ailleurs carte stylisée hors ligne).

**Réseau et confidentialité**
- L'app est **sans réseau** hormis géocodage du système, Apple Plans (cartes) et ce que fait la dictée.
  Si une fonction se met à envoyer quoi que ce soit, mettre à jour `docs/privacy.html`. Le correcteur
  est hors ligne : ne jamais suggérer qu'une connexion est requise. **Jamais de clé Google payante.**

## Dépendances, assets et outils
- Assets **générés**, à ne pas supprimer : `src/frenchPhonetic.json` (~5,9 Mo, correcteur),
  `src/montserratFonts.ts` / `src/albumFonts.ts` (polices du rendu album en base64), `src/worldLand.ts`
  (fond de carte, `design/build-worldmap.py`). Régénération : `ARCHITECTURE.md` › Dépendances & assets.
- Icônes et logo : sources SVG et procédure dans **`design/README.md`** (`node design/build-icons.js`) ;
  jamais repartir d'un PNG. Les icônes n'apparaissent que dans un build natif.
- **Outils PC uniquement, jamais dans les deps RN** : `sharp`, `qrcode`, `@expo-google-fonts/*`. Les
  installer en **`npm install <pkg> --no-save`**, générer, puis `npm uninstall <pkg> --no-save` (au
  besoin `rm -rf node_modules/<pkg>`) et **vérifier que `package.json` est inchangé**. La skill de
  design vit dans `.agents/skills/` (non suivi, hors commits, comme les notes `*.doc` et
  `skills-lock.json`).
- ⚠️ **Ne jamais toucher `node_modules` avec Metro allumé** (`npm install/uninstall`, `npx expo
  install`, `npm dedupe`) : Metro garde la carte des modules et répond ensuite `Unable to resolve
  module <nom>` vers un chemin disparu, alors que le paquet est bien là. Remise en route : arrêter
  Metro, supprimer `node_modules/.cache`, `$TEMP/metro-cache` et `$TEMP/metro-file-map-*`, puis
  `npx expo start --clear`.

## Site public `docs/` et identité
- `docs/` est publié par **GitHub Pages depuis `main` + `/docs`** (dépôt **public** obligatoire) : un
  commit resté sur une branche ne publie rien. Ses quatre fichiers sont exigés par les stores
  (`index.html` = page d'installation visée par `INSTALL_URL` de `src/links.ts`, `privacy.html`,
  `support.html`, `google<hash>.html` = preuve Search Console) : ne pas les supprimer.
- `slug` = **`photo-album-print`** : il identifie le projet côté EAS, ne pas le « corriger ».
  `expo.name` = `ComClic` ; noms affichés et textes d'autorisation traduits dans `locales/*.json`
  (nouveau build). `ios.supportsTablet` = `false`.

## Commits
Messages **en français**, préfixe conventionnel quand il s'applique (`feat:`, `fix:`, `docs:`,
`chore:`), sujet centré sur l'effet utilisateur. Exemples du dépôt : `feat: envoyer/recevoir un album
entre utilisateurs ComClic`, `docs: documenter le downscale des photos dans le PDF (readPrintBase64)`.

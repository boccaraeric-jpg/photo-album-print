# Publication de ComClic — EAS Update, TestFlight, Google Play

Notes de publication sorties de `CLAUDE.md` (qui n'en garde que l'essentiel). À lire **avant** de
publier un update, de lancer un build ou de toucher aux fiches des stores.

> ⚠️ Ne pas déplacer ce fichier dans `docs/` : GitHub Pages publie ce dossier, ces notes
> deviendraient publiques.

## Partage aux testeurs (EAS Update)
- Projet `@boccaras-team/photo-album-print` (propriété de l'**organisation** `boccaras-team` ;
  `owner` dans `app.json` ; le compte perso est `boccara`). Deux canaux existent, `preview` et
  `production` — **choisir selon la cible, se tromper de canal ne remonte aucune erreur** :
  ```bash
  npx eas-cli update --branch production --message "..."   # ← build TestFlight (le cas courant)
  npx eas-cli update --branch preview    --message "..."   # ← Expo Go / builds internes
  ```
  Le build TestFlight `1.0.0 (6)` écoute **`production`** (`updateChannel` du build, visible par
  `eas build:list --json`). Expo Go étant hors jeu (cf. `CLAUDE.md`, Commands), `production` est le
  canal normal.
- **Un update ne s'applique pas au lancement où il est téléchargé.** Par défaut `expo-updates` affiche
  d'abord la version en cache et télécharge en arrière-plan : il faut **laisser l'app ouverte au
  premier plan ~30 s**, puis la fermer **complètement** et la rouvrir. Fermer trop vite interrompt le
  téléchargement, et on peut répéter l'opération indéfiniment sans rien voir changer. Plusieurs
  updates publiés à la suite s'appliquent **un par lancement**.
- Le repère à donner au testeur n'est **pas** le numéro TestFlight (figé par le build) mais
  l'étiquette de `versionLabel()` en bas de `WelcomeScreen` (horodatage + fin d'`updateId`) :
  comparer avec la fin de l'`iOS update ID` affiché par `eas update`. Voir `CLAUDE.md`, « Petits
  modules ».
- `runtimeVersion` doit rester `{ "policy": "sdkVersion" }` dans `app.json` (la politique
  `appVersion` casse le chargement dans Expo Go). Le runtime d'un update (`exposdk:54.0.0`) doit
  **correspondre** à celui du build visé, sinon l'update est publié mais jamais servi.
- ⚠️ **Depuis le 12 mai 2026, Expo Go ne charge un projet EAS Update que pour un compte membre du
  propriétaire.** Rendre le projet public n'y change rien. Un testeur doit être invité en **Viewer**
  dans l'org `boccaras-team`, accepter l'email **avec l'adresse exacte de l'invitation** (pas de
  « Se connecter avec Apple/Google » qui crée un autre email), puis se connecter dans Expo Go avec
  ce compte avant de scanner le QR. Sinon : `HTTP 403 ... requires authentication`.

## Build natif & TestFlight (EAS Build)
- Expo Go **ne va pas** sur TestFlight (bac à sable dev). Pour Apple : un **build `.ipa`** via EAS Build.
- `app.json` : `ios.bundleIdentifier` = `android.package` = `com.boccarasteam.comclic`.
- `eas.json` : profils `development` / `preview` (`distribution: internal`) / `production`
  (`autoIncrement`, `appVersionSource: remote`). TestFlight = profil **`production`**.
- Flux : `eas build --platform ios --profile production` puis
  `eas submit --platform ios --profile production --latest` → App Store Connect → TestFlight.
- ⚠️ Les réglages **natifs** (ex. `CFBundleLocalizations` FR dans `app.json.ios.infoPlist`, qui
  traduisent les boutons caméra et le menu Coller/Sélectionner en français) n'arrivent **que par un
  build**, jamais par un EAS Update (OTA = JS uniquement).
- **`.easignore`** (commité) remplace `.gitignore` pour l'archive envoyée à EAS : il en reprend donc
  **tout** le contenu, plus `.agents/`, `.claude/`, `skills-lock.json`. Ces dossiers contiennent des
  **liens symboliques** que Windows refuse de recréer dans le clone temporaire d'EAS
  (`EPERM: operation not permitted, symlink …`), ce qui faisait échouer l'upload. Motifs images
  ancrés (`/*.png`) pour ne pas exclure `assets/`.
- **Vérifier qu'un module natif est réellement dans le livrable** plutôt que de le déduire du code :
  dézipper l'`.ipa` et chercher le symbole dans `Payload/*.app/<binaire>` (`grep -ac`), ou l'`.aab`
  et chercher dans `base/dex/*.dex`. Un module absent donne 0 occurrence alors qu'`ExpoCamera` en
  donne des dizaines — c'est le test qui a tranché le diagnostic de la dictée (cf. `CLAUDE.md`,
  épinglage sur la dist-tag du SDK).

## Android & Google Play
- Même base de code, même `app.json` : `android.package`, `adaptiveIcon` (4 couches), permissions
  média/micro et `androidIntentFilters` du partage entrant sont déjà en place.
- `eas build --platform android --profile production` produit un **`.aab`** (format imposé par
  Google). Le **keystore** est généré et conservé par EAS : le perdre interdit **définitivement**
  toute mise à jour sous `com.boccarasteam.comclic`. Récupérable par
  `eas credentials -p android` → `Download existing keystore` (le `.jks` seul est inutile sans les
  deux mots de passe affichés au même écran).
- Le `.aab` pèse ~107 Mo car il embarque **quatre architectures** ; Google n'en livre qu'une par
  appareil (~30 Mo). Ne pas chercher à « alléger » ce chiffre.
- Fiche Play : icône **512×512**, image de présentation **1024×500** (sans équivalent Apple),
  captures dont le **rapport ne dépasse pas 2:1** — une capture d'iPhone (2,16:1) est refusée telle
  quelle, il faut des bandes latérales, pas un rognage. Ne **jamais** mentionner iOS, l'App Store ou
  TestFlight dans une fiche Play (référence à une plateforme concurrente).
- Compte de type **Organisation** : dispense de la règle « 12 testeurs pendant 14 jours » imposée aux
  comptes personnels, mais impose la validation du **site web** déclaré via une propriété Google
  Search Console (cf. `docs/`).

## Connexion Expo Go (pièges récurrents)
> **Inapplicable tant que le projet est en SDK 54** (Expo Go est en SDK 57, cf. `CLAUDE.md`).
> Conservé pour l'après-montée de SDK ou un development build. Ne pas s'y lancer pour « réparer »
> une connexion Expo Go.
- Après **tout** `npm/expo install`, arrêter Metro et relancer avec `npx expo start --clear`.
- « Même wifi mais ça ne charge plus » : le PC sert bien (bundle HTTP 200 en local) ; côté iPhone
  c'est en général une **IP DHCP qui a changé** OU le **pare-feu Windows en profil « Public »** qui
  bloque le port 8081. Contournement fiable = **tunnel** : `npx expo start --tunnel` (passe par
  internet, ignore IP/pare-feu). Récupérer l'URL tunnel via l'API ngrok locale
  `http://localhost:4040/api/tunnels` (host `*.exp.direct`), puis générer un QR de `exp://<host>`
  (paquet `qrcode` installé en `--no-save` le temps de générer, cf. `CLAUDE.md`, outils PC).
- **Débloquer le LAN sans tunnel** (quand le tunnel ngrok plante, cf. `ERR_NGROK_3200` /
  `Cannot read properties of undefined (reading 'body')`) : passer le wifi en **profil « Privé »**
  (Paramètres Windows, pas admin) **puis** autoriser le port en entrée — commande **admin** :
  `New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private`.
  Le profil Privé seul ne suffit pas si l'action entrante par défaut est « bloquer ».
- **Le QR/adresse LAN (`exp://192.168.x.x:8081`) ne marche QUE pour un appareil sur le même wifi.**
  Une IP `192.168.*` est privée : injoignable depuis la 5G ou un autre réseau → « Internet
  connection appears to be offline ». Pour un testeur **hors du wifi**, il faut le **tunnel** ou
  **EAS Update**, jamais le LAN.
- Piège : dans Expo Go, l'entrée **« Recently opened »** rejoue une **vieille URL tunnel**
  (`*.exp.direct`) même après passage en LAN → scanner le QR neuf / saisir l'URL à la main.

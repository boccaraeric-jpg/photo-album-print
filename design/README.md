# Identité visuelle ComClic

Sources **vectorielles et versionnées** de l'icône et du logo. Tout se régénère depuis les SVG de ce
dossier : **ne jamais repartir d'un JPEG ou d'un PNG exporté**, la définition serait perdue à chaque
tour.

## Le dessin actuel (« icône v7 »)

**Monogramme « CC » seul**, sienne sur crème, formé par les **cercles de visée** : deux arcs ouverts
à droite, centres `x = 338` et `x = 686`, `y = 512`, rayon `166`, `stroke-width: 84`. Les deux C sont
dimensionnés pour **remplir le cercle de visée extérieur**.

> ⚠️ **Ne pas rapprocher les deux C.** Essayé : à centres plus proches les arcs s'enchevêtrent et le
> sigle devient une tache illisible aux petites tailles.

## Les fichiers sources

| Fichier | Rôle |
|---|---|
| `icon.svg` | visuel complet, fond crème bord à bord |
| `icon-foreground.svg` | visuel seul à 66 %, transparent — zone sûre de l'icône adaptative Android |
| `icon-monochrome.svg` | « CC » plein en noir, teinté par Android |
| `logo-mark.svg` | **marque seule**, transparente, sans les cercles de visée |

## Régénérer les PNG

`sharp` est un **outil PC**, jamais une dépendance de l'app :

```bash
npm install sharp --no-save
node design/build-icons.js
npm uninstall sharp --no-save
```

Vérifier ensuite que `package.json` est **inchangé** (comparer avec une copie prise avant
l'installation), et au besoin `rm -rf node_modules/sharp`.

> ⚠️ Ce cycle installation / désinstallation **fait tomber Metro** s'il tourne (`ENOENT … watch
> 'node_modules/.<tmp>'` : le watcher suit un dossier temporaire disparu). Générer les assets
> **Metro arrêté**, ou le relancer après.

Le script écrit dans `assets/` :

| PNG | Taille | Remarque |
|---|---|---|
| `icon.png` | 1024 | iOS — **carré plein**, le masque arrondi est celui d'iOS |
| `welcome-logo.png` | 512 | arrondi par le `borderRadius` du style, pas par l'image |
| `favicon.png` | 48 | |
| `android-icon-foreground.png` | 1024 | couche avant de l'icône adaptative |
| `android-icon-monochrome.png` | 1024 | couche monochrome |
| `logo-mark.png` | 256 | rappel de marque dans les en-têtes de l'app |

`android-icon-background.png` est un **aplat** `#FBF4EA` (la crème intérieure), la même valeur que
`adaptiveIcon.backgroundColor` dans `app.json` : changer l'une sans l'autre fait apparaître un liseré
sur les icônes adaptatives.

> ⚠️ Ces icônes **n'apparaissent que dans un build natif**. Sous Expo Go, l'app porte l'icône d'Expo
> Go — inutile d'y chercher un bug de génération.

## Historique des versions

Conservé parce qu'il dit ce qui a **déjà été refusé**, pour ne pas y revenir :

| Version | Dessin | Sort |
|---|---|---|
| v2 | un **dossier** | abandonné |
| v3 | appareil photo détaillé, **chevron** par-dessus | le chevron masquait l'objectif |
| v4 | chevron réduit en badge | refusé |
| v5 | chevron agrandi | insuffisant |
| v6 | chevron remplacé par le **double C**, sur fond d'appareil photo | le chevron ne disait rien du nom de l'app ; l'appareil photo alourdissait |
| **v7** | appareil photo retiré, **« CC » seul** | **actuel** |

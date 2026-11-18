# Banc d'essai PDF

Sort l'album **sur PC**, tel que le téléphone l'imprimera, pour juger une mise en page sans attendre
une update sur l'appareil. Outil de développement : rien ici n'est embarqué dans l'app.

```bash
node design/pdf-preview/preview.js                          # Loisir 16 × 16, variante iOS
node design/pdf-preview/preview.js --format 16x21
node design/pdf-preview/preview.js --format a4
node design/pdf-preview/preview.js --style pro --lang en    # rapport professionnel, en anglais
node design/pdf-preview/preview.js --os android             # ce que sort Android
node design/pdf-preview/preview.js --opts '{"frame":"border","photoSize":"large"}'
```

Résultat dans `design/pdf-preview/out/<nom>/` (ignoré par git) : `album.html`, `album.pdf` et des
planches-contact `planche-01.png`… (8 pages par planche) — **ce sont les planches qu'on regarde**.
La liste complète des options est en tête de `preview.js`.

## Ce qu'il fait

1. Charge `src/pdf.ts` sous node (`sucrase`, déjà dans `node_modules`) en remplaçant les modules
   Expo / React Native par des bouchons, et appelle le vrai `buildAlbumHtml`.
2. **Variante iOS** (par défaut) : réécrit `@page { size }` en `floor(1,25 × taille du papier)` px
   — A4 `743px 1052px`, 16 × 21 `566px 744px`, 16 × 16 `566px 566px`. WebKit iOS compose la page à
   cette largeur avant de la réduire ; Chrome ne le fait pas seul. **Sans cette réécriture, un PDF
   correct sous Chrome peut sortir à 80 %, décalé ou avec des pages blanches sur l'iPhone.** Le PDF
   obtenu est donc plus petit que le papier (425 pt au lieu de 453 en 16 × 16) : c'est la page de
   composition, pas un défaut.
3. Imprime avec Chrome headless, puis `sheets.py` monte les planches et **signale les pages
   blanches** (hauteur de fiche mal estimée, feuille qui déborde).

## Prérequis

- **Chrome** (ou Edge) : trouvé aux emplacements habituels, sinon variable `CHROME`.
- **Python + PyMuPDF** pour les planches : `pip install pymupdf` (dans un venv au besoin, puis
  variable `PYTHON` vers son `python.exe`). Sans Python : `--no-sheets`, et on ouvre le PDF à la main.

## Images d'essai

Par défaut, des **images factices** générées à la volée (paysage, portrait, carré, panoramique ;
liseré foncé pour voir un recadrage ; carte quadrillée). Pour de vraies photos : `--img <dossier>`
avec des `.jpg`/`.png` — ceux dont le nom commence par `map` servent de cartes, les autres de
photos, dans l'ordre alphabétique.

> ⚠️ **Ne jamais commiter de vraies photos** : le dépôt est public. Les garder hors du dépôt ou
> sous `out/`.

L'album d'essai (lieux, commentaires) est écrit en dur dans `preview.js` et rassemble les cas qui
ont déjà cassé : lieux en minuscules, apostrophes d'élision manquantes, gras et souligné, texte
long, photos sans lieu, fond de page propre aux deux premières photos.

## Limites

- Ne contrôle que le **moteur HTML** (`src/pdf.ts` : aperçu et PDF). Le moteur **Skia**
  (`src/pageImages.ts`, « Images de l'album ») et les écrans de l'app ne se voient **que sur un
  appareil**.
- Les cartes Apple Plans sont remplacées par une image factice (ou par les `map*` de `--img`) :
  leur vrai contenu ne se juge que sur l'iPhone.
- La simulation iOS reproduit la largeur de composition, pas tout WebKit : un doute sérieux se lève
  sur l'iPhone.

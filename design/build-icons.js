// Régénère les icônes de l'app à partir des SVG de ce dossier.
//
// `sharp` est un outil PC uniquement : ne JAMAIS l'ajouter aux dépendances RN.
//   npm install sharp --no-save
//   node design/build-icons.js
//   npm uninstall sharp --no-save
//
// Sources : icon.svg (visuel complet, fond crème bord à bord),
// icon-foreground.svg (visuel seul à 66 %, transparent, zone sûre Android),
// icon-monochrome.svg (silhouette, teintée par Android).
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'node_modules', 'sharp'));

const SRC = __dirname;
const ASSETS = path.join(__dirname, '..', 'assets');

const jobs = [
  ['icon.svg', 'icon.png', 1024],
  ['icon.svg', 'welcome-logo.png', 512],
  ['icon.svg', 'favicon.png', 48],
  ['icon-foreground.svg', 'android-icon-foreground.png', 1024],
  ['icon-monochrome.svg', 'android-icon-monochrome.png', 1024],
  // Marque seule (transparente) : petit logo des en-têtes dans l'app.
  ['logo-mark.svg', 'logo-mark.png', 256],
];

async function main() {
  for (const [src, out, size] of jobs) {
    const info = await sharp(path.join(SRC, src), { density: 400 })
      .resize(size, size)
      .png()
      .toFile(path.join(ASSETS, out));
    console.log(out, `${info.width}x${info.height}`, `${info.size}o`);
  }
  // Aplat de fond Android = crème intérieure de l'icône (= adaptiveIcon.backgroundColor).
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: '#FBF4EA' },
  })
    .png()
    .toFile(path.join(ASSETS, 'android-icon-background.png'));
  console.log('android-icon-background.png 1024x1024 (#FBF4EA)');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

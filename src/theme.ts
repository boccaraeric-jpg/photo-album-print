// Thème « Chambre Claire » — élégance argentique : papier crème, encre tiède,
// unique accent terre de Sienne. Voir « Chambre Claire — philosophie.md ».

/** Fonds proposés pour l'album (mise en page) et pour une page (aperçu). */
export const ALBUM_BACKGROUNDS = [
  '#f6f1e9', // crème
  '#ffffff', // blanc
  '#dfe3e8', // gris clair
  '#f6ddd0', // rose poudré
  '#fbf3c4', // jaune clair
  '#dcf3e0', // vert clair
  '#f9dada', // rouge clair
  '#dbeafe', // bleu clair
  '#22211f', // sombre
];

export const C = {
  paper: '#F1E9D6', // fond crème (papier chiffon)
  card: '#FBF7EC', // cartes / feuilles / barres
  tan: '#EADDC4', // fonds de boutons doux, puces
  ink: '#201B14', // encre (titres, boutons principaux)
  inkSoft: '#4A4234',
  muted: '#8C806A', // gris chaud (légendes)
  faint: '#B9AC93', // très discret
  sienna: '#A64B24', // accent unique
  line: 'rgba(32,27,20,0.14)',
};

// Typographie unique : Montserrat partout — interface et rendu album (PDF/JPEG)
// partagent la même famille. Les clés gardent leurs noms d'origine pour ne pas
// toucher aux styles existants ; seules les graisses changent.
export const F = {
  display: 'MontserratExtraBold', // titres (800, comme les titres du rendu album)
  mono: 'Montserrat', // corps, labels, champs (500, comme le corps du rendu album)
  monoBold: 'MontserratBold', // boutons, valeurs mises en avant (700)
  // Échantillons du choix de typographie de l'album (écran de mise en page).
  serifBold: 'LoraBold',
  scriptBold: 'CaveatBold',
};

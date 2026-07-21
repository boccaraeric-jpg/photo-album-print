// Thème « Chambre Claire » — élégance argentique : papier crème, encre tiède,
// unique accent terre de Sienne. Voir « Chambre Claire — philosophie.md ».

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
};

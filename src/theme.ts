// Thème « Chambre Claire » — élégance argentique : papier crème, encre tiède,
// unique accent terre de Sienne. Voir « Chambre Claire — philosophie.md ».

/**
 * Fonds proposés pour l'album (mise en page) et pour une page (aperçu), en
 * trois familles. Pas de tons moyens (terracotta, orange, rose vif) : ni l'encre
 * sombre ni l'encre claire n'y restent lisibles. Les profonds passent le texte
 * en clair (`isDark` des moteurs, seuil de luminance 128), les naturels gardent
 * l'encre sombre avec des petits textes plus foncés (`mutedInk`). Les couleurs
 * déjà enregistrées dans des réglages ne doivent pas changer de valeur.
 */
export const ALBUM_BACKGROUND_GROUPS = {
  light: [
    '#f6f1e9', // crème
    '#ffffff', // blanc
    '#dfe3e8', // gris clair
    '#f6ddd0', // rose poudré
    '#fbf3c4', // jaune clair
    '#dcf3e0', // vert clair
    '#f9dada', // rouge clair
    '#dbeafe', // bleu clair
  ],
  natural: [
    '#ebe3d5', // lin
    '#e3d3b5', // sable
    '#c9ae88', // kraft
    '#c8d3bf', // sauge
    '#b9ab9b', // taupe
  ],
  deep: [
    '#1f2a44', // bleu nuit
    '#1f3a2e', // vert sapin
    '#4a1c24', // bordeaux
    '#3a3d42', // anthracite
    '#22211f', // noir
  ],
} as const;

export type BackgroundGroup = keyof typeof ALBUM_BACKGROUND_GROUPS;
export const BACKGROUND_GROUP_KEYS: BackgroundGroup[] = ['light', 'natural', 'deep'];
export const ALBUM_BACKGROUNDS: string[] = BACKGROUND_GROUP_KEYS.flatMap(
  (g) => ALBUM_BACKGROUND_GROUPS[g],
);

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

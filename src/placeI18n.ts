import type { Lang } from './i18n';

/*
 * Noms de lieux dans la langue de l'album.
 *
 * Le lieu d'une photo est un **texte** enregistré une fois pour toutes, dans la
 * langue du téléphone au moment du géocodage (« Athènes, Grèce ») ou tel que
 * l'utilisateur l'a tapé. Un album sorti en anglais gardait donc « Athènes »,
 * « Londres » (retour testeur). Le géocodeur du système ne sait pas répondre
 * dans une langue choisie : la conversion se fait ici, **hors ligne**, par une
 * table des pays et des grandes villes dont le nom diffère entre le français
 * et l'anglais. Un nom absent de la table sort tel quel — c'est le cas de la
 * plupart des communes, identiques dans les deux langues.
 *
 * Le texte enregistré n'est jamais modifié : la conversion n'a lieu qu'à
 * l'affichage (PDF, images, carte des lieux, `contexte.txt`).
 */

/** Paires [français, anglais]. */
const PAIRS: [string, string][] = [
  // --- Pays et territoires ---
  ['Afrique du Sud', 'South Africa'],
  ['Albanie', 'Albania'],
  ['Algérie', 'Algeria'],
  ['Allemagne', 'Germany'],
  ['Andorre', 'Andorra'],
  ['Arabie saoudite', 'Saudi Arabia'],
  ['Argentine', 'Argentina'],
  ['Arménie', 'Armenia'],
  ['Australie', 'Australia'],
  ['Autriche', 'Austria'],
  ['Azerbaïdjan', 'Azerbaijan'],
  ['Bahreïn', 'Bahrain'],
  ['Barbade', 'Barbados'],
  ['Belgique', 'Belgium'],
  ['Bénin', 'Benin'],
  ['Bhoutan', 'Bhutan'],
  ['Biélorussie', 'Belarus'],
  ['Birmanie', 'Myanmar'],
  ['Bolivie', 'Bolivia'],
  ['Bosnie-Herzégovine', 'Bosnia and Herzegovina'],
  ['Brésil', 'Brazil'],
  ['Bulgarie', 'Bulgaria'],
  ['Cambodge', 'Cambodia'],
  ['Cameroun', 'Cameroon'],
  ['Cap-Vert', 'Cape Verde'],
  ['Chili', 'Chile'],
  ['Chine', 'China'],
  ['Chypre', 'Cyprus'],
  ['Colombie', 'Colombia'],
  ['Comores', 'Comoros'],
  ['Corée du Nord', 'North Korea'],
  ['Corée du Sud', 'South Korea'],
  ["Côte d'Ivoire", 'Ivory Coast'],
  ['Croatie', 'Croatia'],
  ['Danemark', 'Denmark'],
  ['Dominique', 'Dominica'],
  ['Écosse', 'Scotland'],
  ['Égypte', 'Egypt'],
  ['Émirats arabes unis', 'United Arab Emirates'],
  ['Équateur', 'Ecuador'],
  ['Érythrée', 'Eritrea'],
  ['Espagne', 'Spain'],
  ['Estonie', 'Estonia'],
  ['États-Unis', 'United States'],
  ['Éthiopie', 'Ethiopia'],
  ['Fidji', 'Fiji'],
  ['Finlande', 'Finland'],
  ['Gambie', 'Gambia'],
  ['Géorgie', 'Georgia'],
  ['Grèce', 'Greece'],
  ['Groenland', 'Greenland'],
  ['Guinée', 'Guinea'],
  ['Guinée équatoriale', 'Equatorial Guinea'],
  ['Guyane', 'French Guiana'],
  ['Haïti', 'Haiti'],
  ['Hongrie', 'Hungary'],
  ['Île Maurice', 'Mauritius'],
  ['Maurice', 'Mauritius'],
  ['Inde', 'India'],
  ['Indonésie', 'Indonesia'],
  ['Irak', 'Iraq'],
  ['Irlande', 'Ireland'],
  ['Islande', 'Iceland'],
  ['Israël', 'Israel'],
  ['Italie', 'Italy'],
  ['Jamaïque', 'Jamaica'],
  ['Japon', 'Japan'],
  ['Jordanie', 'Jordan'],
  ['Kirghizistan', 'Kyrgyzstan'],
  ['Koweït', 'Kuwait'],
  ['Lettonie', 'Latvia'],
  ['Liban', 'Lebanon'],
  ['Libye', 'Libya'],
  ['Lituanie', 'Lithuania'],
  ['Macédoine du Nord', 'North Macedonia'],
  ['Malaisie', 'Malaysia'],
  ['Malte', 'Malta'],
  ['Maroc', 'Morocco'],
  ['Mauritanie', 'Mauritania'],
  ['Mexique', 'Mexico'],
  ['Moldavie', 'Moldova'],
  ['Mongolie', 'Mongolia'],
  ['Monténégro', 'Montenegro'],
  ['Namibie', 'Namibia'],
  ['Népal', 'Nepal'],
  ['Norvège', 'Norway'],
  ['Nouvelle-Calédonie', 'New Caledonia'],
  ['Nouvelle-Zélande', 'New Zealand'],
  ['Ouganda', 'Uganda'],
  ['Ouzbékistan', 'Uzbekistan'],
  ['Papouasie-Nouvelle-Guinée', 'Papua New Guinea'],
  ['Pays-Bas', 'Netherlands'],
  ['Pays de Galles', 'Wales'],
  ['Pérou', 'Peru'],
  ['Pologne', 'Poland'],
  ['Polynésie française', 'French Polynesia'],
  ['Porto Rico', 'Puerto Rico'],
  ['République centrafricaine', 'Central African Republic'],
  ['République dominicaine', 'Dominican Republic'],
  ['République tchèque', 'Czech Republic'],
  ['Tchéquie', 'Czechia'],
  ['Roumanie', 'Romania'],
  ['Royaume-Uni', 'United Kingdom'],
  ['Russie', 'Russia'],
  ['Sainte-Lucie', 'Saint Lucia'],
  ['Saint-Marin', 'San Marino'],
  ['Salvador', 'El Salvador'],
  ['Sénégal', 'Senegal'],
  ['Serbie', 'Serbia'],
  ['Singapour', 'Singapore'],
  ['Slovaquie', 'Slovakia'],
  ['Slovénie', 'Slovenia'],
  ['Somalie', 'Somalia'],
  ['Soudan', 'Sudan'],
  ['Suède', 'Sweden'],
  ['Suisse', 'Switzerland'],
  ['Syrie', 'Syria'],
  ['Tadjikistan', 'Tajikistan'],
  ['Tanzanie', 'Tanzania'],
  ['Tchad', 'Chad'],
  ['Thaïlande', 'Thailand'],
  ['Trinité-et-Tobago', 'Trinidad and Tobago'],
  ['Tunisie', 'Tunisia'],
  ['Turquie', 'Turkey'],
  ['Vatican', 'Vatican City'],
  ['Viêt Nam', 'Vietnam'],
  ['Yémen', 'Yemen'],
  ['Zambie', 'Zambia'],
  // --- Régions et îles courantes ---
  ['Angleterre', 'England'],
  ['Baléares', 'Balearic Islands'],
  ['Bavière', 'Bavaria'],
  ['Bretagne', 'Brittany'],
  ['Californie', 'California'],
  ['Canaries', 'Canary Islands'],
  ['Catalogne', 'Catalonia'],
  ['Corse', 'Corsica'],
  ['Crète', 'Crete'],
  ['Floride', 'Florida'],
  ['Madère', 'Madeira'],
  ['Majorque', 'Mallorca'],
  ['Normandie', 'Normandy'],
  ['Sardaigne', 'Sardinia'],
  ['Sicile', 'Sicily'],
  ['Toscane', 'Tuscany'],
  // --- Villes ---
  ['Alexandrie', 'Alexandria'],
  ['Alger', 'Algiers'],
  ['Anvers', 'Antwerp'],
  ['Athènes', 'Athens'],
  ['Bâle', 'Basel'],
  ['Barcelone', 'Barcelona'],
  ['Belgrade', 'Belgrade'],
  ['Berne', 'Bern'],
  ['Bologne', 'Bologna'],
  ['Bruxelles', 'Brussels'],
  ['Bucarest', 'Bucharest'],
  ['Cologne', 'Cologne'],
  ['Copenhague', 'Copenhagen'],
  ['Cordoue', 'Cordoba'],
  ['Cracovie', 'Krakow'],
  ['Damas', 'Damascus'],
  ['Dubaï', 'Dubai'],
  ['Édimbourg', 'Edinburgh'],
  ['Florence', 'Florence'],
  ['Francfort', 'Frankfurt'],
  ['Gand', 'Ghent'],
  ['Gênes', 'Genoa'],
  ['Genève', 'Geneva'],
  ['Grenade', 'Granada'],
  ['Hambourg', 'Hamburg'],
  ['Hanoï', 'Hanoi'],
  ['La Havane', 'Havana'],
  ['La Haye', 'The Hague'],
  ['Le Caire', 'Cairo'],
  ['Le Cap', 'Cape Town'],
  ['Lisbonne', 'Lisbon'],
  ['Londres', 'London'],
  ['Marrakech', 'Marrakesh'],
  ['Mexico', 'Mexico City'],
  ['Moscou', 'Moscow'],
  ['Munich', 'Munich'],
  ['Naples', 'Naples'],
  ['La Nouvelle-Orléans', 'New Orleans'],
  ['Padoue', 'Padua'],
  ['Pékin', 'Beijing'],
  ['Pise', 'Pisa'],
  ['Prague', 'Prague'],
  ['Québec', 'Quebec'],
  ['Rome', 'Rome'],
  ['Saint-Pétersbourg', 'Saint Petersburg'],
  ['Salzbourg', 'Salzburg'],
  ['Séoul', 'Seoul'],
  ['Séville', 'Seville'],
  ['Sienne', 'Siena'],
  ['Tanger', 'Tangier'],
  ['Téhéran', 'Tehran'],
  ['Tokyo', 'Tokyo'],
  ['Turin', 'Turin'],
  ['Varsovie', 'Warsaw'],
  ['Venise', 'Venice'],
  ['Vérone', 'Verona'],
  ['Vienne', 'Vienna'],
  ['Zurich', 'Zurich'],
];

/** Forme de comparaison : minuscules, apostrophe droite, espaces simples. */
function keyOf(name: string): string {
  return name.trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
}

/**
 * Table d'une langue vers l'autre. Deux gardes :
 * - plusieurs noms pour une même clé (« Grenade », pays et ville) : la
 *   première paire de la table gagne ;
 * - un nom qui existe **aussi** dans l'autre langue avec un autre sens
 *   (« Mexico » : la ville en français, le pays en anglais) n'est jamais
 *   converti — dans le doute, le texte saisi reste tel quel.
 */
function index(from: 0 | 1): Map<string, string> {
  const to = from === 0 ? 1 : 0;
  const other = new Set(PAIRS.filter((p) => p[0] !== p[1]).map((p) => keyOf(p[to])));
  const map = new Map<string, string>();
  for (const pair of PAIRS) {
    const key = keyOf(pair[from]);
    if (pair[0] !== pair[1] && !map.has(key) && !other.has(key)) map.set(key, pair[to]);
  }
  return map;
}


const TO_EN = index(0);
const TO_FR = index(1);

/** Un nom seul (ville ou pays) dans la langue demandée ; inchangé s'il est inconnu. */
export function localizePlaceName(name: string, lang: Lang): string {
  const table = lang === 'en' ? TO_EN : lang === 'fr' ? TO_FR : null;
  return table?.get(keyOf(name)) ?? name;
}

/**
 * Lieu complet (« Athènes, Grèce ») dans la langue demandée : chaque partie
 * séparée par une virgule est convertie pour elle-même.
 */
export function localizePlace(place: string, lang: Lang): string {
  return place
    .split(',')
    .map((part) => {
      const name = part.trim();
      return name ? localizePlaceName(name, lang) : '';
    })
    .filter(Boolean)
    .join(', ');
}

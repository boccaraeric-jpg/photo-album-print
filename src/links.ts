// Liens externes de l'app (installation, aide). Un **seul** endroit à modifier.
//
// `INSTALL_URL` pointe vers la page d'installation publiée par GitHub Pages
// (source : `docs/index.html` de ce dépôt). C'est volontairement une page
// intermédiaire et non un lien TestFlight/App Store en dur : l'URL reste
// valable quand l'app change de canal de distribution, sans republier de build.
import { Share } from 'react-native';
import { dict, type Lang } from './i18n';

export const INSTALL_URL = 'https://boccaraeric-jpg.github.io/photo-album-print/';

/**
 * Ouvre la feuille de partage native avec un message texte contenant le lien
 * d'installation (SMS, WhatsApp, Messenger, Mail…). Texte seul et non fichier :
 * c'est ce qui passe partout et reste cliquable chez le destinataire.
 */
export async function shareInstallLink(lang: Lang): Promise<void> {
  await Share.share({ message: dict(lang).invite.message(INSTALL_URL) });
}

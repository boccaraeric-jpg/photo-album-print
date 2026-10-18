import * as Updates from 'expo-updates';
import { dict, localeTag, type Lang } from './i18n';

/**
 * Étiquette de version affichée sur l'écran d'accueil.
 *
 * Le numéro de TestFlight (« 1.0.0 (6) ») ne dit **que** le build natif : il ne
 * bouge pas d'un pouce quand un EAS Update remplace le JavaScript. Or c'est
 * l'inverse qui se produit le plus souvent ici — le natif change une fois par
 * mois, le JS plusieurs fois par jour. D'où l'horodatage de l'update en cours,
 * seul repère qui permette de dire « oui, la correction de 19 h est bien là ».
 *
 * `isEmbeddedLaunch` distingue le bundle **gravé dans le build** (aucun update
 * téléchargé, ou retour arrière après un update défaillant) d'un update reçu.
 * En Expo Go comme en développement, `expo-updates` est inerte : on retombe
 * alors sur la mention « intégrée ».
 */
/**
 * Applique tout de suite la dernière update publiée, pendant l'écran d'accueil.
 *
 * Par défaut, `expo-updates` lance la version déjà présente et ne télécharge la
 * nouvelle qu'en arrière-plan, pour le lancement **suivant** — d'où les « deux
 * ou trois relances » nécessaires, et, juste après l'installation d'un nouveau
 * build TestFlight, une app qui tourne sur le JavaScript gravé dans ce build
 * (plus ancien que les updates publiées depuis). Ici : vérification,
 * téléchargement, puis redémarrage sur la nouvelle version — mais seulement si
 * `stillWelcome()` est encore vrai : on ne recharge jamais l'app sous les
 * doigts de quelqu'un qui a déjà touché « Commencer » (elle s'appliquera alors
 * au lancement suivant, comme avant). Sans réseau ou en Expo Go : rien.
 */
export async function applyLatestUpdate(
  stillWelcome: () => boolean,
  onDownloading: () => void,
): Promise<void> {
  try {
    if (__DEV__ || !Updates.isEnabled) return;
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable || !stillWelcome()) return;
    onDownloading();
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew && stillWelcome()) await Updates.reloadAsync();
  } catch {
    // Réseau absent ou serveur injoignable : la version en place convient.
  }
}

export function versionLabel(lang: Lang): string {
  const D = dict(lang).version;
  const app = (require('../app.json') as { expo?: { version?: string } })?.expo
    ?.version;
  const base = app ? `v${app}` : '';

  try {
    if (Updates.isEmbeddedLaunch || !Updates.updateId) {
      return [base, D.embedded].filter(Boolean).join(' · ');
    }
    const at = Updates.createdAt;
    const stamp = at
      ? at.toLocaleString(localeTag(lang), {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    // La FIN de l'identifiant : ces UUID sont ordonnés par le temps, leurs
    // premiers caractères sont donc identiques d'un update à l'autre.
    const id = Updates.updateId.replace(/-/g, '').slice(-6);
    return [base, D.update, stamp, id].filter(Boolean).join(' · ');
  } catch {
    // expo-updates absent (Expo Go) : le numéro d'app suffit.
    return base;
  }
}

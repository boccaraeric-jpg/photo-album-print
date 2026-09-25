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

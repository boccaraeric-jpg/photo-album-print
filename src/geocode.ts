import { Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * Convertit des coordonnées GPS en libellé de lieu lisible (« Nice, France »)
 * via le géocodage inverse système. Best-effort : renvoie `undefined` en cas
 * d'échec (hors ligne, quota atteint, permission refusée sur Android), auquel
 * cas l'utilisateur pourra saisir le lieu à la main.
 *
 * Le géocodage inverse de coordonnées fournies n'exige pas la permission de
 * localisation sur iOS (on ne lit pas la position de l'appareil).
 */
export async function reverseGeocode(coords: {
  lat: number;
  lon: number;
}): Promise<string | undefined> {
  try {
    // Android exige la permission de localisation pour le géocodage inverse ;
    // iOS non (on ne lit pas la position de l'appareil) — surtout ne pas la
    // demander sur iOS, un refus casserait la localisation alors qu'elle marche.
    if (Platform.OS === 'android') {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return undefined;
    }

    const results = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lon,
    });
    const a = results[0];
    if (!a) return undefined;

    const locality = a.city ?? a.subregion ?? a.region ?? a.name ?? undefined;
    const parts = [locality, a.country ?? undefined].filter(
      (p): p is string => !!p,
    );
    return parts.length ? parts.join(', ') : undefined;
  } catch {
    return undefined;
  }
}

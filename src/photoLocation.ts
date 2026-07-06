import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import type { ImagePickerAsset } from 'expo-image-picker';
import { extractCoords } from './exif';

type Coords = { lat: number; lon: number };

/**
 * Position de l'appareil à l'instant présent — utilisée pour géolocaliser une
 * photo prise depuis l'app (expo-image-picker n'attache pas le GPS à la capture,
 * et il n'existe pas encore d'asset à interroger). Demande la permission de
 * localisation (nécessaire ici : on lit bien la position de l'appareil).
 */
export async function getCurrentCoords(): Promise<Coords | undefined> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return undefined;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return undefined;
  }
}

/**
 * Résout les coordonnées GPS d'une photo choisie.
 *
 * Sur iOS, le sélecteur moderne (PHPicker) **retire le GPS de l'EXIF** par
 * confidentialité : `extractCoords(exif)` est alors vide. On récupère donc la
 * position via `expo-media-library` à partir de l'`assetId` de l'asset (ce qui
 * marche pour une photo réellement géolocalisée). Repli EXIF pour l'appareil
 * photo et Android.
 */
export async function resolveCoords(
  asset: ImagePickerAsset,
): Promise<Coords | undefined> {
  const fromExif = extractCoords(asset);
  if (fromExif) return fromExif;

  if (!asset.assetId) return undefined;
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) {
      const req = await MediaLibrary.requestPermissionsAsync();
      if (!req.granted) return undefined;
    }
    const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
    const loc = info.location;
    if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
      return { lat: loc.latitude, lon: loc.longitude };
    }
  } catch {
    // Permission refusée ou asset introuvable → pas de lieu automatique.
  }
  return undefined;
}

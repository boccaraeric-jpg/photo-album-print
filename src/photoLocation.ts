import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import type { ImagePickerAsset } from 'expo-image-picker';
import { extractCoords, extractTakenAt } from './exif';

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
 * Date de prise de vue d'une photo choisie dans la galerie.
 *
 * Même piège que pour le GPS : sur iOS, PHPicker **caviarde les métadonnées** de
 * l'asset remis à l'app, donc `extractTakenAt()` revient souvent vide et la photo
 * héritait de sa date d'**import** (`photoDate()` retombe sur `createdAt`). La
 * photothèque, elle, connaît la vraie date : on la lui demande via l'`assetId`.
 * `creationTime` est en millisecondes, comme `takenAt`.
 */
export async function resolveTakenAt(
  asset: ImagePickerAsset,
): Promise<number | undefined> {
  const fromExif = extractTakenAt(asset);
  if (fromExif) return fromExif;

  if (!asset.assetId) return undefined;
  try {
    const perm = await MediaLibrary.getPermissionsAsync();
    if (!perm.granted) {
      const req = await MediaLibrary.requestPermissionsAsync();
      if (!req.granted) return undefined;
    }
    const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
    const ts = info.creationTime;
    if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) return ts;
  } catch {
    // Permission refusée ou asset introuvable → repli sur la date d'ajout.
  }
  return undefined;
}

/**
 * Dernière position connue du système — **immédiate** (aucune acquisition GPS).
 * Sert à ne pas faire attendre l'utilisateur après une prise de photo :
 * `getCurrentCoords()` peut demander plusieurs secondes le temps d'obtenir un
 * point, ce qui retardait d'autant l'ouverture de l'éditeur de commentaire.
 *
 * Ne demande **pas** la permission : si elle n'a jamais été accordée, on renvoie
 * `undefined` et c'est l'appel de précision, lancé en arrière-plan, qui posera la
 * question. Position ignorée au-delà de 5 minutes — au-delà, l'utilisateur a pu
 * se déplacer et un lieu faux vaut moins que pas de lieu.
 */
export async function getLastKnownCoords(): Promise<Coords | undefined> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return undefined;
    const pos = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
    });
    if (!pos) return undefined;
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

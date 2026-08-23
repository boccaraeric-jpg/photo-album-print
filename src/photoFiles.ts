import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/** Répertoire de stockage persistant des images de l'album. */
const PHOTOS_DIR = `${FileSystem.documentDirectory}album-photos/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

/**
 * Copie une image (issue de l'appareil photo ou de la galerie, dont l'URI est
 * temporaire) vers le répertoire documents de l'app pour la rendre durable.
 * Retourne la nouvelle URI persistante.
 */
export async function persistImage(srcUri: string, id: string): Promise<string> {
  await ensureDir();
  const ext = srcUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext) ? ext : 'jpg';
  const dest = `${PHOTOS_DIR}${id}.${safeExt}`;
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}

/**
 * Copie un fichier déjà persisté vers une nouvelle entrée du répertoire de
 * l'app (duplication d'un dossier). Chaque copie est **indépendante** : la
 * supprimer ne touche pas l'original (cf. `deleteImage`).
 */
export async function copyImage(uri: string, id: string): Promise<string> {
  return persistImage(uri, id);
}

/** Supprime le fichier image associé (sans échouer s'il n'existe plus). */
export async function deleteImage(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}

/** Écrit une image encodée en base64 dans le répertoire de l'album et retourne son URI. */
export async function writeBase64Image(
  base64: string,
  filename: string,
): Promise<string> {
  await ensureDir();
  const dest = `${PHOTOS_DIR}${filename}`;
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

/** Lit une image et la retourne encodée en base64 (image brute, non redimensionnée). */
export async function readBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Dimensions en pixels d'une image locale. */
function getPixelSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// Les data URI d'un même fichier reviennent identiques (aperçu re-rendu, puis
// PDF) : on mémorise le base64 déjà calculé pour ne pas recompresser à chaque
// fois. Cache borné : au-delà, on vide (les albums sont petits, la mémoire prime).
const printCache = new Map<string, string>();

/**
 * Lit une image et la retourne **redimensionnée + recompressée** en base64 JPEG,
 * prête à être intégrée (data URI) dans le HTML du PDF / de l'aperçu.
 *
 * Motif : les photos de l'iPhone font ~4000 px / plusieurs Mo, alors qu'elles
 * s'affichent au plus sur une page A4 (595×842 pt). Embarquer l'original brut
 * multiplié par le nombre de photos produisait des PDF de dizaines/centaines de
 * Mo (base64 gonfle encore de +33 %), intransmissibles. On plafonne donc le
 * **côté long** à `maxEdge` px et on recompresse en JPEG `quality`.
 *
 * @param maxEdge côté le plus long en pixels (jamais d'agrandissement).
 * @param quality compression JPEG 0–1.
 */
export async function readPrintBase64(
  uri: string,
  maxEdge = 1600,
  quality = 0.72,
): Promise<string> {
  const key = `${uri}|${maxEdge}|${quality}`;
  const cached = printCache.get(key);
  if (cached !== undefined) return cached;

  let actions: ImageManipulator.Action[] = [];
  try {
    const { width, height } = await getPixelSize(uri);
    const longest = Math.max(width, height);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      actions = [
        { resize: { width: Math.round(width * scale), height: Math.round(height * scale) } },
      ];
    }
  } catch {
    // Dimensions indisponibles (ex. HEIC parfois) : repli sûr = plafonner la
    // largeur, l'aspect est préservé automatiquement par le manipulateur.
    actions = [{ resize: { width: maxEdge } }];
  }

  const res = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  const b64 = res.base64 ?? '';

  if (printCache.size > 60) printCache.clear();
  printCache.set(key, b64);
  return b64;
}

/**
 * Poids d'un fichier image sur le disque, en octets (0 si absent ou illisible).
 * Sert au tri « Taille de fichier » de l'accueil.
 */
export async function fileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  } catch {
    return 0;
  }
}

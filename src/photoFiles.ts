import * as FileSystem from 'expo-file-system/legacy';

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

/** Lit une image et la retourne encodée en base64 (pour intégration dans le PDF). */
export async function readBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

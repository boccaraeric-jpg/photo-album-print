import * as MediaLibrary from 'expo-media-library';

/**
 * Enregistre une image dans la photothèque du téléphone (app Photos),
 * afin que les photos prises depuis l'app soient aussi conservées hors album.
 * Demande une permission en écriture seule au premier appel.
 *
 * @returns true si la photo a été enregistrée, false si la permission est refusée.
 */
export async function saveToPhotoLibrary(uri: string): Promise<boolean> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return false;
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}

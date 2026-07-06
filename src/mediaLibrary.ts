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

/**
 * Enregistre plusieurs images dans la photothèque (pages JPEG du mini album),
 * en ne demandant la permission qu'une fois. L'utilisateur peut ensuite les
 * envoyer en lot depuis l'app Photos (expo-sharing ne partage qu'un fichier).
 *
 * @returns true si les images ont été enregistrées, false si permission refusée.
 */
export async function saveManyToPhotoLibrary(uris: string[]): Promise<boolean> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return false;
  for (const uri of uris) {
    await MediaLibrary.saveToLibraryAsync(uri);
  }
  return true;
}

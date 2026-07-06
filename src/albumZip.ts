import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { albumFileBase } from './pdf';

/**
 * Regroupe des images (pages JPEG du mini album) dans une archive ZIP unique,
 * envoyable via la feuille de partage (expo-sharing ne partageant qu'un seul
 * fichier). Retourne l'URI du ZIP nommé « Nom de l'album JJ-MM-AAAA.zip ».
 */
export async function zipImages(
  uris: string[],
  title: string,
): Promise<string> {
  const zip = new JSZip();
  for (let i = 0; i < uris.length; i++) {
    const base64 = await FileSystem.readAsStringAsync(uris[i], {
      encoding: FileSystem.EncodingType.Base64,
    });
    const name = uris[i].split('/').pop() ?? `page-${i + 1}.jpg`;
    zip.file(name, base64, { base64: true });
  }
  const content = await zip.generateAsync({ type: 'base64' });
  const dest = `${FileSystem.cacheDirectory}${albumFileBase(title)}.zip`;
  await FileSystem.writeAsStringAsync(dest, content, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

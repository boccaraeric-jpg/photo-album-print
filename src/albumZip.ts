import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { albumFileBase } from './pdf';
import type { Photo } from './types';
import { formatPhotoDate, photoDate } from './dateFormat';
import { dict, type Lang } from './i18n';
import { stripMarks } from './richText';
import { ZipStreamWriter } from './zipStream';

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

/** Rend un nom de fichier sûr à partir d'un extrait de commentaire. */
function safeSnippet(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}

/**
 * Regroupe les **photos affichées** de l'album (fichiers d'origine réutilisables,
 * pleine résolution) dans un ZIP, accompagnées d'un fichier « contexte.txt » qui
 * liste pour chaque photo son commentaire / sa date / son lieu. Les pages de
 * texte n'ont pas d'image mais sont reprises dans le fichier de contexte.
 *
 * ⚠️ Pleine résolution = des centaines de Mo pour un gros album : l'archive est
 * écrite **en flux** (`ZipStreamWriter`), une photo à la fois. La version
 * JSZip construisait tout en mémoire et faisait tuer l'app par iOS au-delà
 * d'une trentaine de photos.
 * @param entries photos ordonnées (images + pages de texte)
 * @param onProgress appelé après chaque photo (`done` sur `total`)
 * @returns l'URI du ZIP « Nom de l'album JJ-MM-AAAA - photos.zip »
 */
export async function zipPhotos(
  entries: Photo[],
  title: string,
  lang: Lang = 'fr',
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const D = dict(lang).doc;
  const zip = new ZipStreamWriter(`${albumFileBase(title)} - photos.zip`);
  const lines: string[] = [title, '='.repeat(Math.max(title.length, 3)), ''];
  const total = entries.filter((p) => p.kind !== 'text').length;

  try {
    let n = 0;
    for (const p of entries) {
      if (p.kind === 'text') {
        lines.push(D.textPageMarker);
        if (p.comment.trim()) lines.push(stripMarks(p.comment).trim());
        lines.push('');
        continue;
      }
      n += 1;
      const num = String(n).padStart(2, '0');
      const snippet = safeSnippet(stripMarks(p.comment));
      const fname = snippet ? `${num} - ${snippet}.jpg` : `${num}.jpg`;
      try {
        await zip.addFile(fname, p.uri);
      } catch {
        // Fichier illisible : on garde quand même le contexte.
      }
      onProgress?.(n, total);
      lines.push(`Photo ${num} : ${fname}`);
      const date = formatPhotoDate(photoDate(p), 'full', lang);
      if (date) lines.push(`  ${D.date} : ${date}`);
      if (p.place?.trim()) lines.push(`  ${D.place} : ${p.place.trim()}`);
      if (p.comment.trim())
        lines.push(`  ${D.comment} : ${stripMarks(p.comment).trim()}`);
      lines.push('');
    }

    zip.addText(D.contextFile, lines.join('\n'));
    return zip.finish();
  } catch (e) {
    zip.abort();
    throw e;
  }
}

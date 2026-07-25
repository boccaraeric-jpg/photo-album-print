import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { newId } from './id';
import { writeBase64Image } from './photoFiles';
import type { Photo } from './types';

// Fichier album ComClic : un ZIP (extension .comclic) contenant les images
// pleine résolution + un manifeste JSON qui décrit tout (commentaires, lieux,
// dates, ordre, couverture, pages de texte, nom du dossier). Sert à envoyer un
// album à un ami qui a ComClic : il le reçoit via le partage système et l'app le
// reconstruit à l'identique (cf. `parseAlbumBundle` + import dans `App`).

const MANIFEST = 'manifest.json';
const MARKER = 'comclic-album';

/** Une entrée du manifeste (image ou page de texte). */
interface BundleEntry {
  /** Nom du fichier image dans le ZIP (absent pour une page de texte). */
  file?: string;
  kind: 'photo' | 'text';
  comment: string;
  place?: string;
  takenAt?: number;
  order?: number;
  cover?: boolean;
}

/** Nom de fichier sûr pour un système de fichiers. */
function safeName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Album'
  );
}

/**
 * Construit le fichier album ComClic (`<Nom>.comclic`) à partir des entrées
 * ordonnées du dossier. Retourne l'URI du fichier prêt à partager.
 */
export async function buildAlbumBundle(
  entries: Photo[],
  albumName: string,
  coverPhotoId?: string,
): Promise<string> {
  const zip = new JSZip();
  const manifestEntries: BundleEntry[] = [];
  let n = 0;
  for (const p of entries) {
    if (p.kind === 'text') {
      manifestEntries.push({
        kind: 'text',
        comment: p.comment,
        order: p.order,
      });
      continue;
    }
    n += 1;
    const file = `${String(n).padStart(3, '0')}.jpg`;
    try {
      const b64 = await FileSystem.readAsStringAsync(p.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      zip.file(file, b64, { base64: true });
      manifestEntries.push({
        file,
        kind: 'photo',
        comment: p.comment,
        place: p.place,
        takenAt: p.takenAt,
        order: p.order,
        cover: p.id === coverPhotoId,
      });
    } catch {
      // Image illisible : on l'omet, le reste de l'album part quand même.
    }
  }

  const manifest = {
    marker: MARKER,
    version: 1,
    name: albumName,
    entries: manifestEntries,
  };
  zip.file(MANIFEST, JSON.stringify(manifest));

  const content = await zip.generateAsync({ type: 'base64' });
  const dest = `${FileSystem.cacheDirectory}${safeName(albumName)}.comclic`;
  await FileSystem.writeAsStringAsync(dest, content, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}

/** Entrée reconstruite d'un album reçu (image persistée localement ou texte). */
export interface ImportedEntry {
  kind: 'photo' | 'text';
  /** URI locale de l'image extraite (absente pour une page de texte). */
  uri?: string;
  comment: string;
  place?: string;
  takenAt?: number;
  order?: number;
  cover?: boolean;
}

/**
 * Lit un fichier partagé et, s'il s'agit d'un album ComClic valide, extrait ses
 * images dans le stockage de l'app et retourne le nom + les entrées reconstruites.
 * Retourne `null` si le fichier n'est **pas** un album ComClic (autre ZIP, image
 * simple…), pour que l'appelant retombe sur l'import d'images classique.
 */
export async function parseAlbumBundle(
  fileUri: string,
): Promise<{ name: string; entries: ImportedEntry[] } | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const manifestFile = zip.file(MANIFEST);
    if (!manifestFile) return null;

    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest?.marker !== MARKER || !Array.isArray(manifest.entries)) {
      return null;
    }

    const out: ImportedEntry[] = [];
    for (const e of manifest.entries as BundleEntry[]) {
      if (e.kind === 'text') {
        out.push({ kind: 'text', comment: e.comment ?? '', order: e.order });
        continue;
      }
      let uri: string | undefined;
      const imgFile = e.file ? zip.file(e.file) : null;
      if (imgFile) {
        const imgB64 = await imgFile.async('base64');
        uri = await writeBase64Image(imgB64, `${newId()}.jpg`);
      }
      out.push({
        kind: 'photo',
        uri,
        comment: e.comment ?? '',
        place: e.place,
        takenAt: e.takenAt,
        order: e.order,
        cover: e.cover,
      });
    }
    return { name: typeof manifest.name === 'string' ? manifest.name : '', entries: out };
  } catch {
    return null;
  }
}

/** Vrai si le nom de fichier partagé ressemble à un album ComClic. */
export function looksLikeBundle(pathOrName: string): boolean {
  return /\.comclic$|\.zip$/i.test(pathOrName);
}

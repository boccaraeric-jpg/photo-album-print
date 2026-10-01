import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import { newId } from './id';
import { readPrintBase64, writeBase64Image } from './photoFiles';
import { comparePhotos } from './storage';
import { fileDateStamp } from './dateFormat';
import type { Album, AlbumSort, ExportOptions, Photo } from './types';
import type { Lang } from './i18n';
import { BUNDLE_EXT, type ImportedEntry } from './albumBundle';

/**
 * Sauvegarde complète : **tous** les dossiers dans un seul fichier `.comclic.zip`,
 * que l'utilisateur dépose lui-même dans iCloud Drive / Fichiers / un mail.
 *
 * Pourquoi c'est nécessaire alors que l'iPhone sauvegarde déjà l'app : la
 * sauvegarde iCloud couvre la perte ou le remplacement du téléphone, **pas la
 * suppression de l'app** — iOS efface alors le conteneur, donc les fichiers
 * image ET la base AsyncStorage. C'est le seul cas où tout disparaît sans
 * recours, et c'est celui que ce fichier couvre.
 *
 * Même mécanique que `albumBundle.ts` (ZIP + manifeste), mais un **marqueur
 * distinct** : le même bouton d'import accepte les deux, et un album envoyé par
 * un ami ne peut pas être pris pour une sauvegarde.
 *
 * ⚠️ **Limite assumée de cette version** : JSZip construit l'archive en mémoire
 * puis la convertit en base64 (+33 %). Les images sont donc recompressées comme
 * pour un album envoyé, et le nombre d'entrées est plafonné — au-delà, iOS tue
 * l'app au lieu d'écrire un fichier tronqué. Une sauvegarde en pleine
 * résolution demandera une écriture en flux (API `File` du SDK 54).
 */

const MANIFEST = 'manifest.json';
const MARKER = 'comclic-backup';

/** Au-delà, on refuse plutôt que de risquer l'arrêt brutal par iOS. */
export const MAX_BACKUP_PHOTOS = 200;

export interface BackupSettings {
  lang?: Lang;
  sort?: AlbumSort;
  exportOptions?: ExportOptions;
}

interface BackupEntry {
  /** Nom du fichier image dans le ZIP (absent pour une page de texte). */
  file?: string;
  kind: 'photo' | 'text';
  comment: string;
  place?: string;
  takenAt?: number;
  order?: number;
  cover?: boolean;
}

interface BackupAlbum {
  name: string;
  createdAt: number;
  entries: BackupEntry[];
}

/** Un dossier reconstruit depuis une sauvegarde. */
export interface RestoredAlbum {
  name: string;
  createdAt: number;
  entries: ImportedEntry[];
}

export interface ParsedBackup {
  createdAt: number;
  albums: RestoredAlbum[];
  settings: BackupSettings;
}

export type BackupResult =
  | { status: 'ok'; uri: string; albums: number; photos: number }
  | { status: 'empty' }
  | { status: 'tooLarge'; photos: number };

/** Nom de fichier sûr pour un système de fichiers. */
function safeName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'ComClic'
  );
}

/**
 * Écrit la sauvegarde et renvoie son URI.
 *
 * @param fileBase début du nom de fichier (localisé par l'appelant) ; la date du
 *                 jour et l'extension sont ajoutées ici.
 */
export async function buildBackup(
  albums: Album[],
  photos: Photo[],
  settings: BackupSettings,
  fileBase: string,
): Promise<BackupResult> {
  const total = photos.filter((p) => p.kind !== 'text').length;
  if (!albums.length) return { status: 'empty' };
  if (total > MAX_BACKUP_PHOTOS) return { status: 'tooLarge', photos: total };

  // Budget adaptatif calculé sur le TOTAL de la sauvegarde (et non par dossier
  // comme pour un album isolé) : c'est le poids cumulé qui doit tenir en mémoire.
  const maxEdge = total > 60 ? 1024 : total > 30 ? 1280 : 1600;
  const quality = total > 60 ? 0.68 : 0.72;

  const zip = new JSZip();
  const manifestAlbums: BackupAlbum[] = [];
  let n = 0;

  for (let ai = 0; ai < albums.length; ai++) {
    const album = albums[ai];
    const dir = `a${String(ai + 1).padStart(3, '0')}`;
    const entries = photos
      .filter((p) => p.albumId === album.id)
      .sort(comparePhotos);
    const out: BackupEntry[] = [];

    for (const p of entries) {
      if (p.kind === 'text') {
        out.push({ kind: 'text', comment: p.comment, order: p.order });
        continue;
      }
      n += 1;
      const file = `${dir}/${String(n).padStart(4, '0')}.jpg`;
      const entry: BackupEntry = {
        kind: 'photo',
        comment: p.comment,
        place: p.place,
        takenAt: p.takenAt,
        order: p.order,
        cover: p.id === album.coverPhotoId,
      };
      try {
        const b64 = await readPrintBase64(p.uri, maxEdge, quality);
        zip.file(file, b64, { base64: true });
        entry.file = file;
      } catch {
        // Image illisible : l'entrée reste au manifeste (commentaire, lieu,
        // date conservés) mais sans fichier — jamais de renvoi vers un absent.
      }
      out.push(entry);
    }

    manifestAlbums.push({
      name: album.name,
      createdAt: album.createdAt,
      entries: out,
    });
  }

  zip.file(
    MANIFEST,
    JSON.stringify({
      marker: MARKER,
      version: 1,
      createdAt: Date.now(),
      settings,
      albums: manifestAlbums,
    }),
  );

  const content = await zip.generateAsync({ type: 'base64' });
  const dest = `${FileSystem.cacheDirectory}${safeName(fileBase)} ${fileDateStamp()}${BUNDLE_EXT}`;
  await FileSystem.writeAsStringAsync(dest, content, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const written = manifestAlbums.reduce(
    (sum, a) => sum + a.entries.filter((e) => e.file).length,
    0,
  );
  return { status: 'ok', uri: dest, albums: albums.length, photos: written };
}

/**
 * Lit **seulement le manifeste** d'une sauvegarde : de quoi annoncer son
 * contenu avant de demander confirmation. `parseBackup`, lui, écrit les images
 * sur le disque — le faire avant l'accord de l'utilisateur laisserait des
 * fichiers orphelins à chaque annulation.
 */
export async function peekBackup(
  fileUri: string,
): Promise<{ createdAt: number; albums: number; photos: number } | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const manifestFile = zip.file(MANIFEST);
    if (!manifestFile) return null;
    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest?.marker !== MARKER || !Array.isArray(manifest.albums)) {
      return null;
    }
    const list = manifest.albums as BackupAlbum[];
    return {
      createdAt:
        typeof manifest.createdAt === 'number' ? manifest.createdAt : Date.now(),
      albums: list.length,
      photos: list.reduce(
        (sum, a) => sum + (a.entries ?? []).filter((e) => e.kind === 'photo').length,
        0,
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Lit un fichier et, s'il s'agit d'une sauvegarde ComClic, extrait ses images
 * dans le stockage de l'app. Renvoie `null` pour tout autre contenu — album
 * ComClic d'un ami compris, que l'appelant traitera par `parseAlbumBundle`.
 */
export async function parseBackup(fileUri: string): Promise<ParsedBackup | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const zip = await JSZip.loadAsync(b64, { base64: true });
    const manifestFile = zip.file(MANIFEST);
    if (!manifestFile) return null;

    const manifest = JSON.parse(await manifestFile.async('string'));
    if (manifest?.marker !== MARKER || !Array.isArray(manifest.albums)) {
      return null;
    }

    const out: RestoredAlbum[] = [];
    for (const a of manifest.albums as BackupAlbum[]) {
      const entries: ImportedEntry[] = [];
      for (const e of a.entries ?? []) {
        if (e.kind === 'text') {
          entries.push({ kind: 'text', comment: e.comment ?? '', order: e.order });
          continue;
        }
        let uri: string | undefined;
        const imgFile = e.file ? zip.file(e.file) : null;
        if (imgFile) {
          uri = await writeBase64Image(
            await imgFile.async('base64'),
            `${newId()}.jpg`,
          );
        }
        entries.push({
          kind: 'photo',
          uri,
          comment: e.comment ?? '',
          place: e.place,
          takenAt: e.takenAt,
          order: e.order,
          cover: e.cover,
        });
      }
      out.push({
        name: typeof a.name === 'string' ? a.name : '',
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
        entries,
      });
    }

    return {
      createdAt:
        typeof manifest.createdAt === 'number' ? manifest.createdAt : Date.now(),
      albums: out,
      settings: (manifest.settings ?? {}) as BackupSettings,
    };
  } catch {
    return null;
  }
}

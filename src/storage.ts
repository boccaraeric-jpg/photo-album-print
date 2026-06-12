import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Album, ExportOptions, Photo } from './types';
import { newId } from './id';

const ALBUMS_KEY = 'album.albums.v1';
const PHOTOS_KEY = 'album.photos.v1';
const EXPORT_OPTIONS_KEY = 'album.exportOptions.v1';
/** Clé du titre unique d'avant les dossiers (utilisée seulement pour la migration). */
const LEGACY_TITLE_KEY = 'album.title.v1';

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface StoredData {
  albums: Album[];
  photos: Photo[];
}

/**
 * Charge les dossiers et les photos persistés.
 *
 * Migration depuis la version sans dossiers : si aucun dossier n'est encore
 * enregistré mais que des photos existent, elles sont regroupées dans un
 * premier dossier nommé d'après l'ancien titre de l'album.
 */
export async function loadData(): Promise<StoredData> {
  const [rawAlbums, rawPhotos, legacyTitle] = await Promise.all([
    AsyncStorage.getItem(ALBUMS_KEY),
    AsyncStorage.getItem(PHOTOS_KEY),
    AsyncStorage.getItem(LEGACY_TITLE_KEY),
  ]);

  let albums = parse<Album[]>(rawAlbums) ?? [];
  let photos = (parse<Photo[]>(rawPhotos) ?? []).sort(
    (a, b) => a.createdAt - b.createdAt,
  );

  if (!rawAlbums && photos.length > 0) {
    const first: Album = {
      id: newId(),
      name: legacyTitle ?? 'Mon album',
      createdAt: Date.now(),
    };
    albums = [first];
    photos = photos.map((p) => ({ ...p, albumId: first.id }));
    await Promise.all([saveAlbums(albums), savePhotos(photos)]);
  } else if (albums.length > 0) {
    // Sécurité : rattache toute photo orpheline au premier dossier.
    photos = photos.map((p) =>
      p.albumId ? p : { ...p, albumId: albums[0].id },
    );
  }

  return { albums, photos };
}

/** Persiste la liste des dossiers. */
export async function saveAlbums(albums: Album[]): Promise<void> {
  await AsyncStorage.setItem(ALBUMS_KEY, JSON.stringify(albums));
}

/** Persiste la liste des photos (tous dossiers confondus). */
export async function savePhotos(photos: Photo[]): Promise<void> {
  await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}

/** Charge les dernières options d'export choisies, ou null. */
export async function loadExportOptions(): Promise<ExportOptions | null> {
  return parse<ExportOptions>(await AsyncStorage.getItem(EXPORT_OPTIONS_KEY));
}

/** Persiste les options d'export pour les prochains albums. */
export async function saveExportOptions(options: ExportOptions): Promise<void> {
  await AsyncStorage.setItem(EXPORT_OPTIONS_KEY, JSON.stringify(options));
}

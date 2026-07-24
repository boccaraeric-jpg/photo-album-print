import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Album, ExportOptions, Photo } from './types';
import { newId } from './id';
import { SUPPORTED, type Lang } from './i18n';

const ALBUMS_KEY = 'album.albums.v1';
const PHOTOS_KEY = 'album.photos.v1';
const EXPORT_OPTIONS_KEY = 'album.exportOptions.v1';
const LANG_KEY = 'album.lang.v1';
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
 * Ordre d'affichage des photos : rang manuel (`order`) d'abord, puis, à défaut,
 * date d'ajout. Les photos rangées à la main passent avant les non rangées.
 */
export function comparePhotos(a: Photo, b: Photo): number {
  const ao = a.order;
  const bo = b.order;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  return a.createdAt - b.createdAt;
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
  let photos = (parse<Photo[]>(rawPhotos) ?? []).sort(comparePhotos);

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

  // Normalise le rang : chaque photo reçoit un `order` contigu au sein de son
  // dossier (dans l'ordre actuel). Ainsi le tri, l'ajout en fin et le
  // glisser-déposer manipulent tous des rangs cohérents.
  if (normalizeOrder(photos)) await savePhotos(photos);

  return { albums, photos: photos.sort(comparePhotos) };
}

/**
 * Attribue un rang contigu (0,1,2…) aux photos de chaque dossier, selon l'ordre
 * courant. Mute les photos concernées et retourne `true` si un rang a changé.
 */
function normalizeOrder(photos: Photo[]): boolean {
  const byAlbum = new Map<string, Photo[]>();
  for (const p of photos) {
    const group = byAlbum.get(p.albumId);
    if (group) group.push(p);
    else byAlbum.set(p.albumId, [p]);
  }
  let changed = false;
  for (const group of byAlbum.values()) {
    group.sort(comparePhotos);
    group.forEach((p, i) => {
      if (p.order !== i) {
        p.order = i;
        changed = true;
      }
    });
  }
  return changed;
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

/** Langue choisie et persistée, ou null si l'utilisateur n'a jamais forcé. */
export async function loadLang(): Promise<Lang | null> {
  const raw = await AsyncStorage.getItem(LANG_KEY);
  return raw && (SUPPORTED as string[]).includes(raw) ? (raw as Lang) : null;
}

/** Persiste la langue forcée par l'utilisateur. */
export async function saveLang(lang: Lang): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, lang);
}

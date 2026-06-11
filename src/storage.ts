import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Photo } from './types';

const PHOTOS_KEY = 'album.photos.v1';
const TITLE_KEY = 'album.title.v1';

/** Charge la liste des photos persistée, triée par ordre de création. */
export async function loadPhotos(): Promise<Photo[]> {
  const raw = await AsyncStorage.getItem(PHOTOS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Photo[];
    return parsed.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Persiste la liste des photos. */
export async function savePhotos(photos: Photo[]): Promise<void> {
  await AsyncStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
}

/** Charge le titre de l'album (valeur par défaut si absent). */
export async function loadTitle(): Promise<string> {
  const raw = await AsyncStorage.getItem(TITLE_KEY);
  return raw ?? 'Mon album';
}

/** Persiste le titre de l'album. */
export async function saveTitle(title: string): Promise<void> {
  await AsyncStorage.setItem(TITLE_KEY, title);
}

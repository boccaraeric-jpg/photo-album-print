import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import { MINI_H, MINI_SPAN_M, MINI_W, photoCoords } from './albumMap';
import type { Photo } from './types';

/*
 * Cartes Apple Plans à côté des photos (module local `modules/comclic-map`,
 * iOS seulement : `MKMapSnapshotter`). Une image par lieu, créée une fois puis
 * gardée dans `documentDirectory/map-snapshots/` : l'export n'a plus besoin du
 * réseau ensuite. Sans le module (Android — aucune clé Google —, Expo Go,
 * build antérieur) ou sans réseau, la carte stylisée hors ligne
 * (`buildMiniMapModel`) prend le relais.
 */

interface ComclicMapModule {
  snapshot(options: {
    lat: number;
    lon: number;
    spanMeters: number;
    width: number;
    height: number;
    uri: string;
  }): Promise<string>;
}

const native = requireOptionalNativeModule<ComclicMapModule>('ComclicMap');

/** Vrai si l'appareil sait produire des cartes Apple Plans. */
export const appleMapsAvailable = !!native;

const DIR = `${FileSystem.documentDirectory ?? ''}map-snapshots/`;
/** Délai maximal d'une carte : au-delà (réseau lent), repli hors ligne. */
const TIMEOUT_MS = 12000;

function fileFor(lat: number, lon: number): string {
  // ~10 m près : deux photos du même endroit partagent leur carte.
  return `${DIR}${lat.toFixed(4)}_${lon.toFixed(4)}_${MINI_SPAN_M}.jpg`;
}

const pending = new Map<string, Promise<string | null>>();

/** Image de carte d'un lieu (URI `file://`), ou `null` → carte hors ligne. */
export async function mapImageFor(lat: number, lon: number): Promise<string | null> {
  if (!native || !FileSystem.documentDirectory) return null;
  const uri = fileFor(lat, lon);
  const running = pending.get(uri);
  if (running) return running;
  const job = (async () => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) return uri;
      await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
      const made = await Promise.race([
        native.snapshot({ lat, lon, spanMeters: MINI_SPAN_M, width: MINI_W, height: MINI_H, uri }),
        timeout,
      ]);
      return made ? uri : null;
    } catch {
      return null;
    } finally {
      pending.delete(uri);
    }
  })();
  pending.set(uri, job);
  return job;
}

/**
 * Cartes des photos `ids` : id → URI de l'image Apple Plans, ou `null` pour
 * une carte hors ligne. Les lieux sont traités l'un après l'autre (le service
 * d'Apple limite les demandes simultanées).
 */
export async function mapImagesFor(
  photos: Photo[],
  ids: Set<string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const p of photos) {
    if (!ids.has(p.id)) continue;
    const c = photoCoords(p);
    if (!c) continue;
    out.set(p.id, await mapImageFor(c.lat, c.lon));
  }
  return out;
}

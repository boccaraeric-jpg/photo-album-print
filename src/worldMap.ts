import { LAND_DATA, LAND_Q } from './worldLand';

/** Contour de terre décodé : coordonnées [lon, lat] à plat, et son emprise. */
export interface LandRing {
  /** lon0, lat0, lon1, lat1, … */
  pts: Float64Array;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

let cache: LandRing[] | null = null;

/**
 * Décode `LAND_DATA` (cf. `design/build-worldmap.py`) une seule fois, à la
 * première page carte : ~236 000 points, quelques dizaines de millisecondes.
 */
export function landRings(): LandRing[] {
  if (cache) return cache;
  const value = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) value[ALPHABET.charCodeAt(i)] = i;

  const data = LAND_DATA;
  let pos = 0;
  const next = (): number => {
    let z = 0;
    let shift = 0;
    for (;;) {
      const c = value[data.charCodeAt(pos++)];
      z += (c & 31) * 2 ** shift;
      if (!(c & 32)) break;
      shift += 5;
    }
    // Zigzag : pair → positif, impair → négatif.
    return z % 2 ? -(z + 1) / 2 : z / 2;
  };

  const rings: LandRing[] = [];
  while (pos < data.length) {
    const n = next();
    const pts = new Float64Array(n * 2);
    let x = 0;
    let y = 0;
    let minLon = 180;
    let maxLon = -180;
    let minLat = 90;
    let maxLat = -90;
    for (let i = 0; i < n; i++) {
      x += next();
      y += next();
      const lon = x / LAND_Q - 180;
      const lat = y / LAND_Q - 90;
      pts[2 * i] = lon;
      pts[2 * i + 1] = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    rings.push({ pts, minLon, maxLon, minLat, maxLat });
  }
  cache = rings;
  return rings;
}

/** Vrai si le point (lon, lat) est dans le contour (règle pair-impair). */
export function ringContains(ring: LandRing, lon: number, lat: number): boolean {
  if (lon < ring.minLon || lon > ring.maxLon || lat < ring.minLat || lat > ring.maxLat) {
    return false;
  }
  const p = ring.pts;
  const n = p.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i];
    const yi = p[2 * i + 1];
    const xj = p[2 * j];
    const yj = p[2 * j + 1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

import type { ImagePickerAsset } from 'expo-image-picker';

/**
 * Extrait la date de prise de vue (ms) depuis l'EXIF d'un asset image-picker.
 *
 * L'EXIF stocke la date au format « YYYY:MM:DD HH:MM:SS » (heure locale de
 * l'appareil, sans fuseau). On la lit dans l'un des champs habituels, puis on
 * la reconstruit comme heure locale. Retourne `undefined` si rien d'exploitable
 * (l'appelant retombe alors sur la date d'ajout).
 */
// Accepte aussi bien un asset d'`expo-image-picker` qu'une capture
// d'`expo-camera` : seul l'EXIF est lu.
export function extractTakenAt(
  asset: Pick<ImagePickerAsset, 'exif'>,
): number | undefined {
  const exif = asset.exif;
  if (!exif) return undefined;

  const raw: unknown =
    exif.DateTimeOriginal ??
    exif.DateTimeDigitized ??
    exif.DateTime ??
    // Sur iOS, l'EXIF peut être imbriqué sous « {Exif} ».
    (exif['{Exif}'] as Record<string, unknown> | undefined)?.DateTimeOriginal;

  if (typeof raw !== 'string') return undefined;

  // « 2026:07:08 19:37:12 » → composants numériques.
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    raw.trim(),
  );
  if (!m) return undefined;

  const [, y, mo, da, h, mi, s] = m;
  const ts = new Date(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(h),
    Number(mi),
    s ? Number(s) : 0,
  ).getTime();

  return Number.isNaN(ts) ? undefined : ts;
}

/**
 * Extrait les coordonnées GPS (lat/lon signées) depuis l'EXIF d'un asset.
 * Retourne `undefined` si absentes — fréquent sur iOS quand l'accès aux photos
 * est « limité » ou pour une capture d'écran (l'appelant bascule alors sur la
 * saisie manuelle du lieu).
 */
export function extractCoords(
  asset: ImagePickerAsset,
): { lat: number; lon: number } | undefined {
  const exif = asset.exif;
  if (!exif) return undefined;

  const gps = (exif['{GPS}'] as Record<string, unknown> | undefined) ?? exif;
  const lat = Number(gps.GPSLatitude ?? gps.Latitude);
  const lon = Number(gps.GPSLongitude ?? gps.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat === 0 && lon === 0) return undefined;

  const latRef = String(gps.GPSLatitudeRef ?? gps.LatitudeRef ?? 'N').toUpperCase();
  const lonRef = String(gps.GPSLongitudeRef ?? gps.LongitudeRef ?? 'E').toUpperCase();
  // Certaines sources donnent déjà des valeurs signées ; le Ref ne fait que
  // confirmer l'hémisphère (on force le signe d'après le Ref).
  const signedLat = latRef === 'S' ? -Math.abs(lat) : Math.abs(lat);
  const signedLon = lonRef === 'W' ? -Math.abs(lon) : Math.abs(lon);
  return { lat: signedLat, lon: signedLon };
}

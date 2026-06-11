import { ImageFormat, Skia } from '@shopify/react-native-skia';
import type { Adjustments } from './types';
import { writeBase64Image } from './photoFiles';

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  rotation: 0,
};

/** Vrai si les réglages sont tous neutres (aucun effet sur l'image). */
export function isNeutral(adj: Adjustments): boolean {
  return (
    adj.exposure === 0 &&
    adj.brightness === 0 &&
    adj.contrast === 0 &&
    adj.saturation === 0 &&
    adj.warmth === 0 &&
    adj.rotation % 360 === 0
  );
}

type ColorMatrix = number[]; // matrice 4x5 en ligne (20 valeurs)

const IDENTITY: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/** Compose deux matrices couleur : le résultat applique `b` puis `a`. */
function multiply(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  const out = new Array<number>(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        v += a[row * 5 + k] * b[k * 5 + col];
      }
      if (col === 4) v += a[row * 5 + 4];
      out[row * 5 + col] = v;
    }
  }
  return out;
}

/**
 * Construit la matrice couleur Skia correspondant aux réglages.
 * Chaque curseur (-100..100) est converti vers sa plage effective :
 * exposition ±1 stop, luminosité ±0.25, contraste ±50 %, saturation 0..2,
 * chaleur ±30 % de balance rouge/bleu.
 */
export function buildColorMatrix(adj: Adjustments): ColorMatrix {
  let m = IDENTITY;

  // Exposition : gain multiplicatif (2^stops).
  const gain = Math.pow(2, adj.exposure / 100);
  m = multiply(
    [gain, 0, 0, 0, 0, 0, gain, 0, 0, 0, 0, 0, gain, 0, 0, 0, 0, 0, 1, 0],
    m,
  );

  // Chaleur : renforce le rouge et atténue le bleu (ou l'inverse).
  const w = (adj.warmth / 100) * 0.3;
  m = multiply(
    [1 + w, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 - w, 0, 0, 0, 0, 0, 1, 0],
    m,
  );

  // Saturation : interpolation entre niveaux de gris (poids luminance) et identité.
  const s = 1 + adj.saturation / 100;
  const sr = 0.213 * (1 - s);
  const sg = 0.715 * (1 - s);
  const sb = 0.072 * (1 - s);
  m = multiply(
    [
      sr + s, sg, sb, 0, 0,
      sr, sg + s, sb, 0, 0,
      sr, sg, sb + s, 0, 0,
      0, 0, 0, 1, 0,
    ],
    m,
  );

  // Contraste : mise à l'échelle autour du gris moyen (0.5).
  const c = 1 + (adj.contrast / 100) * 0.5;
  const co = 0.5 * (1 - c);
  m = multiply(
    [c, 0, 0, 0, co, 0, c, 0, 0, co, 0, 0, c, 0, co, 0, 0, 0, 1, 0],
    m,
  );

  // Luminosité : simple décalage additif.
  const b = (adj.brightness / 100) * 0.25;
  m = multiply(
    [1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0],
    m,
  );

  return m;
}

/** Dimension max (px) du grand côté de l'image gravée — suffisant pour l'impression A4. */
const MAX_BAKED_DIMENSION = 2400;

/**
 * Applique définitivement les réglages à l'image d'origine ("gravure") :
 * décode l'image, dessine hors écran avec la matrice couleur et la rotation,
 * puis écrit le résultat en JPEG dans le répertoire de l'album.
 *
 * @returns l'URI du nouveau fichier image ajusté.
 */
export async function bakeAdjustedImage(
  srcUri: string,
  adj: Adjustments,
  photoId: string,
): Promise<string> {
  const data = await Skia.Data.fromURI(srcUri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error(`Image illisible : ${srcUri}`);

  const srcW = image.width();
  const srcH = image.height();
  const scale = Math.min(1, MAX_BAKED_DIMENSION / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const rotation = ((adj.rotation % 360) + 360) % 360;
  const swapped = rotation === 90 || rotation === 270;
  const outW = swapped ? h : w;
  const outH = swapped ? w : h;

  const surface = Skia.Surface.Make(outW, outH);
  if (!surface) throw new Error('Impossible de créer la surface de rendu.');

  const canvas = surface.getCanvas();
  canvas.rotate(rotation, outW / 2, outH / 2);
  canvas.translate((outW - w) / 2, (outH - h) / 2);

  const paint = Skia.Paint();
  paint.setColorFilter(Skia.ColorFilter.MakeMatrix(buildColorMatrix(adj)));
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, srcW, srcH),
    Skia.XYWHRect(0, 0, w, h),
    paint,
  );

  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, 90);
  return writeBase64Image(base64, `${photoId}-adj-${Date.now()}.jpg`);
}

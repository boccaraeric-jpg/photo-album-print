import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { Annotation, AnnotationWidth } from './types';

/**
 * Annotations dessinées au doigt sur une photo (marqueur) : tracé libre ou
 * flèche, en quatre couleurs. Coordonnées **normalisées** (0 → 1) dans l'image
 * telle qu'affichée (réglages et rotation compris) : le même tracé sert à
 * l'écran d'annotation et à l'image enregistrée (`bakePhoto`), quelle que soit
 * la taille de l'une ou de l'autre.
 */

/** Couleurs du marqueur : noir, rouge (rapport d'expertise), blanc, jaune. */
export const ANNOTATION_COLORS = ['#111111', '#e02424', '#ffffff', '#facc15'] as const;

/** Épaisseurs, en fraction du petit côté de l'image. */
export const ANNOTATION_WIDTHS: Record<AnnotationWidth, number> = {
  thin: 0.006,
  medium: 0.011,
  thick: 0.019,
};

export const ANNOTATION_WIDTH_KEYS: AnnotationWidth[] = ['thin', 'medium', 'thick'];

/** Rectangle (pixels) où l'image est dessinée. */
export interface DrawRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Épaisseur du trait en pixels pour un rectangle d'image donné. */
export function strokePx(a: Annotation, rect: DrawRect): number {
  return Math.max(1, ANNOTATION_WIDTHS[a.width] * Math.min(rect.w, rect.h));
}

/**
 * Tracé Skia d'une annotation dans `rect`. Tracé libre : lissé par des
 * courbes passant par le milieu des segments (un cercle tracé vite reste
 * rond). Flèche : la tige, puis une pointe en V proportionnée au trait.
 */
export function annotationPath(a: Annotation, rect: DrawRect): SkPath {
  const path = Skia.Path.Make();
  const pts = a.points.map(([nx, ny]) => [rect.x + nx * rect.w, rect.y + ny * rect.h]);
  if (!pts.length) return path;
  if (a.kind === 'arrow') {
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[pts.length - 1];
    path.moveTo(x0, y0);
    path.lineTo(x1, y1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > 1) {
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.min(len * 0.45, Math.max(strokePx(a, rect) * 4.5, Math.min(rect.w, rect.h) * 0.04));
      const spread = (28 * Math.PI) / 180;
      path.moveTo(x1 - head * Math.cos(angle - spread), y1 - head * Math.sin(angle - spread));
      path.lineTo(x1, y1);
      path.lineTo(x1 - head * Math.cos(angle + spread), y1 - head * Math.sin(angle + spread));
    }
    return path;
  }
  path.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 1) {
    // Un simple toucher : un point.
    path.lineTo(pts[0][0] + 0.5, pts[0][1] + 0.5);
    return path;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    path.quadTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  const [lx, ly] = pts[pts.length - 1];
  path.lineTo(lx, ly);
  return path;
}

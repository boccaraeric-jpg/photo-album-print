import { dict, localeTag, type Lang } from './i18n';
import type { Photo, Typeface } from './types';
import { photoDate } from './dateFormat';
import { COVER_H, COVER_W, mutedInk, TYPE_SPECS, type FontFam } from './albumStyle';
import { landRings, ringContains } from './worldMap';

/*
 * Page « Nos lieux de visite » du rendu familial : carte illustrée hors ligne
 * des lieux où les photos ont été prises. Comme `albumStyle.ts`, ce module est
 * la source UNIQUE de la page pour les deux moteurs : il calcule une liste de
 * tracés et de textes en points A4, que `pdf.ts` écrit en SVG et
 * `pageImages.ts` dessine en Skia, sans aucune décision de mise en page de
 * leur côté. Fond de carte : `worldMap.ts` (Natural Earth, embarqué).
 */

/** Plafond de lieux : au-delà, la légende déborderait de la page. */
export const MAP_MAX_PLACES = 20;

export interface Place {
  /** Numéro du repère (ordre chronologique de la première visite). */
  n: number;
  name: string;
  /** Dernier segment de « Ville, Pays » (vide si le lieu n'en a qu'un). */
  country: string;
  lat: number;
  lon: number;
  /** Dates de prise de vue (ms), triées. */
  times: number[];
}

/** Coordonnées utilisables d'une photo (ni page de texte, ni GPS absent ou 0,0). */
export function photoCoords(p: Photo): { lat: number; lon: number } | null {
  if (p.kind === 'text' || !p.coords) return null;
  const { lat, lon } = p.coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

function placeParts(p: Photo): string[] {
  return (p.place ?? '')
    .replace(/\s+/g, ' ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Clé d'un lieu : son nom, sinon ses coordonnées arrondies (~1 km). */
export function placeKey(p: Photo): string | null {
  const c = photoCoords(p);
  if (!c) return null;
  const parts = placeParts(p);
  return parts.length ? parts.join(',').toLowerCase() : `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
}

/**
 * Photos qui auraient une carte d'office : une photo géolocalisée dont le lieu
 * change par rapport à la photo géolocalisée précédente (quatre photos de
 * Funchal à la suite → une seule carte). Ordre reçu = ordre de l'album.
 */
export function autoMapIds(photos: Photo[]): Set<string> {
  const ids = new Set<string>();
  let prev: string | null = null;
  for (const p of photos) {
    const key = placeKey(p);
    if (!key) continue;
    if (key !== prev) ids.add(p.id);
    prev = key;
  }
  return ids;
}

/** Photos qui ont leur carte : la règle d'office, corrigée photo par photo (`mapMode`). */
export function mapPhotoIds(photos: Photo[]): Set<string> {
  const auto = autoMapIds(photos);
  const ids = new Set<string>();
  for (const p of photos) {
    if (!photoCoords(p)) continue;
    if (p.mapMode === 'on' || (p.mapMode !== 'off' && auto.has(p.id))) ids.add(p.id);
  }
  return ids;
}

/**
 * Photos de la page « Nos lieux de visite » quand les photos ont leur carte :
 * celles des lieux qui ont au moins une carte (toutes, pour garder toutes les
 * dates du lieu). Décocher la carte d'une photo prise ailleurs retire ce lieu.
 */
export function photosOfMappedPlaces(photos: Photo[], mapIds: Set<string>): Photo[] {
  const keys = new Set(photos.filter((p) => mapIds.has(p.id)).map(placeKey));
  return photos.filter((p) => keys.has(placeKey(p)));
}

/**
 * Lieux des photos géolocalisées, regroupés par nom de lieu (sinon par
 * coordonnées arrondies à ~1 km), position moyenne, dans l'ordre chronologique.
 * Une photo sans `coords` (lieu saisi à la main) ne peut pas être placée.
 */
export function collectPlaces(photos: Photo[], lang: Lang = 'fr'): Place[] {
  const groups = new Map<
    string,
    { name: string; country: string; lat: number; lon: number; k: number; times: number[] }
  >();
  for (const p of photos) {
    const c = photoCoords(p);
    if (!c) continue;
    const { lat, lon } = c;
    const parts = placeParts(p);
    const key = parts.length
      ? parts.join(',').toLowerCase()
      : `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const g = groups.get(key);
    if (g) {
      g.lat += lat;
      g.lon += lon;
      g.k += 1;
      g.times.push(photoDate(p));
    } else {
      groups.set(key, {
        name: parts[0] ?? coordLabel(lat, lon, lang),
        country: parts.length > 1 ? parts[parts.length - 1] : '',
        lat,
        lon,
        k: 1,
        times: [photoDate(p)],
      });
    }
  }
  return [...groups.values()]
    .map((g) => ({
      name: g.name,
      country: g.country,
      lat: g.lat / g.k,
      lon: g.lon / g.k,
      times: g.times.sort((a, b) => a - b),
    }))
    .sort((a, b) => a.times[0] - b.times[0])
    .slice(0, MAP_MAX_PLACES)
    .map((p, i) => ({ ...p, n: i + 1 }));
}

function coordLabel(lat: number, lon: number, lang: Lang): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : lang === 'fr' ? 'O' : 'W';
  const f = (v: number) => {
    const s = Math.abs(v).toFixed(2);
    return lang === 'fr' ? s.replace('.', ',') : s;
  };
  return `${f(lat)}° ${ns}, ${f(lon)}° ${ew}`;
}

/* --------------------------------------------------------------------------
 * Modèle de dessin
 * ------------------------------------------------------------------------ */

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tracé SVG (`d` en points A4 absolus ; commandes M L H V C Q Z seulement). */
export interface MapShape {
  kind: 'shape';
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  /** Pointillé [trait, blanc]. */
  dash?: [number, number];
  /** Opacité de l'ensemble (remplissage et trait). */
  opacity?: number;
  /** Découpe : le tracé ne déborde pas de ce rectangle. */
  clip?: MapRect;
  /** Décalage (ombre portée du relief). */
  offset?: [number, number];
}

/** Texte sur une ligne ; `y` = ligne de base. */
export interface MapText {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  bold: boolean;
  fam: FontFam;
  anchor: 'start' | 'middle' | 'end';
  color: string;
  /** Interlettrage (points). */
  spacing?: number;
}

export type MapItem = MapShape | MapText;

export interface MapModel {
  /** Tout est dessiné dans cet ordre, sur une page A4 au fond de l'album. */
  items: MapItem[];
}

const SEA = '#dbe5e1';
const LAND = '#f1e6cc';
const COAST = '#9c8a6c';
const WAVE = '#9fb5b0';
const MAP_INK = '#1f1d1a';
const PIN = '#b45309';
const LABEL_BG = '#f6f1e9';

/** Largeur moyenne d'un caractère (en em) : sert au fond des étiquettes et aux coupes. */
const CHAR_EM: Record<FontFam, [number, number]> = {
  sans: [0.58, 0.64],
  serif: [0.52, 0.56],
  script: [0.42, 0.44],
};

/** Estimation de largeur, identique pour les deux moteurs (pas de mesure réelle). */
function textWidth(text: string, size: number, bold: boolean, fam: FontFam): number {
  return text.length * size * CHAR_EM[fam][bold ? 1 : 0];
}

/** Coupe un texte avec « … » pour qu'il tienne dans `max` points (estimation). */
function fit(text: string, size: number, bold: boolean, fam: FontFam, max: number): string {
  if (textWidth(text, size, bold, fam) <= max) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}…`, size, bold, fam) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

function rectPath(r: MapRect, radius = 0): string {
  const { x, y, w, h } = r;
  if (!radius) return `M${n1(x)},${n1(y)}H${n1(x + w)}V${n1(y + h)}H${n1(x)}Z`;
  const q = radius;
  return (
    `M${n1(x + q)},${n1(y)}H${n1(x + w - q)}Q${n1(x + w)},${n1(y)} ${n1(x + w)},${n1(y + q)}` +
    `V${n1(y + h - q)}Q${n1(x + w)},${n1(y + h)} ${n1(x + w - q)},${n1(y + h)}` +
    `H${n1(x + q)}Q${n1(x)},${n1(y + h)} ${n1(x)},${n1(y + h - q)}` +
    `V${n1(y + q)}Q${n1(x)},${n1(y)} ${n1(x + q)},${n1(y)}Z`
  );
}

/** Cercle en 4 arcs de Bézier (pas de commande A : parité SVG/Skia assurée). */
function circlePath(cx: number, cy: number, r: number): string {
  const c = r * 0.5523;
  return (
    `M${n1(cx)},${n1(cy - r)}` +
    `C${n1(cx + c)},${n1(cy - r)} ${n1(cx + r)},${n1(cy - c)} ${n1(cx + r)},${n1(cy)}` +
    `C${n1(cx + r)},${n1(cy + c)} ${n1(cx + c)},${n1(cy + r)} ${n1(cx)},${n1(cy + r)}` +
    `C${n1(cx - c)},${n1(cy + r)} ${n1(cx - r)},${n1(cy + c)} ${n1(cx - r)},${n1(cy)}` +
    `C${n1(cx - r)},${n1(cy - c)} ${n1(cx - c)},${n1(cy - r)} ${n1(cx)},${n1(cy - r)}Z`
  );
}

/* --- Projection (Mercator) ------------------------------------------------ */

const RAD = Math.PI / 180;
const merc = (lat: number) => {
  const c = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (c * RAD) / 2));
};
const unmerc = (m: number) => (2 * Math.atan(Math.exp(m)) - Math.PI / 2) / RAD;

interface Proj {
  (lon: number, lat: number): [number, number];
  /** Points par radian de longitude. */
  s: number;
  lonAt(px: number): number;
  latAt(py: number): number;
}

/** Projection centrée sur (cLon, cY) à l'échelle s, centre placé en (ox, oy). */
function makeProj(cLon: number, cY: number, s: number, ox: number, oy: number): Proj {
  const p = ((lon: number, lat: number) => [
    ox + (lon - cLon) * RAD * s,
    oy - (merc(lat) - cY) * s,
  ]) as Proj;
  p.s = s;
  p.lonAt = (px) => cLon + (px - ox) / s / RAD;
  p.latAt = (py) => unmerc(cY - (py - oy) / s);
  return p;
}

type Pt = [number, number];

/** Sutherland–Hodgman sur un rectangle (coordonnées projetées). */
function clipRing(ring: Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let pts = ring;
  for (const [inside, inter] of edges) {
    if (!pts.length) break;
    const out: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const ia = inside(a);
      if (inside(b)) {
        if (!ia) out.push(inter(a, b));
        out.push(b);
      } else if (ia) {
        out.push(inter(a, b));
      }
    }
    pts = out;
  }
  return pts;
}

/** Retire les points à moins de `d` du précédent (détail invisible à l'échelle). */
function thin(pts: Pt[], d: number): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) >= d) out.push(p);
  }
  return out;
}

/** Catmull-Rom fermée en Bézier cubiques : un trait de côte « dessiné ». */
function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  let d = `M${n1(pts[0][0])},${n1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d +=
      `C${n1(p1[0] + (p2[0] - p0[0]) / 6)},${n1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${n1(p2[0] - (p3[0] - p1[0]) / 6)},${n1(p2[1] - (p3[1] - p1[1]) / 6)} ` +
      `${n1(p2[0])},${n1(p2[1])}`;
  }
  return `${d}Z`;
}

function polyPath(pts: Pt[]): string {
  return `M${pts.map((p) => `${n1(p[0])},${n1(p[1])}`).join('L')}Z`;
}

/** Terres visibles dans `box`, projetées, découpées et allégées. */
function landPath(proj: Proj, box: MapRect, smooth: boolean, dmin: number): string {
  const lonA = proj.lonAt(box.x);
  const lonB = proj.lonAt(box.x + box.w);
  const latA = proj.latAt(box.y + box.h);
  const latB = proj.latAt(box.y);
  let d = '';
  for (const ring of landRings()) {
    if (ring.maxLon < lonA || ring.minLon > lonB || ring.maxLat < latA || ring.minLat > latB) {
      continue;
    }
    const raw: Pt[] = [];
    for (let i = 0; i < ring.pts.length; i += 2) raw.push(proj(ring.pts[i], ring.pts[i + 1]));
    const pts = thin(
      clipRing(raw, box.x - 2, box.y - 2, box.x + box.w + 2, box.y + box.h + 2),
      dmin,
    );
    if (pts.length < 3) continue;
    d += smooth ? smoothPath(pts) : polyPath(pts);
  }
  return d;
}

const overlaps = (a: MapRect, b: MapRect, m = 0) =>
  a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

const within = (a: MapRect, b: MapRect, m = 0) =>
  a.x >= b.x + m && a.y >= b.y + m && a.x + a.w <= b.x + b.w - m && a.y + a.h <= b.y + b.h - m;

/* --- Dates ----------------------------------------------------------------- */

function placeDates(times: number[], lang: Lang): string {
  const tag = localeTag(lang);
  const days: string[] = [];
  for (const t of times) {
    const s = new Date(t).toLocaleDateString(tag, { day: 'numeric', month: 'short' });
    if (days[days.length - 1] !== s && !days.includes(s)) days.push(s);
  }
  if (days.length <= 2) return days.join(` ${dict(lang).doc.and} `);
  return `${days[0]} – ${days[days.length - 1]}`;
}

function monthRange(times: number[], lang: Lang): string {
  const tag = localeTag(lang);
  const f = (t: number) =>
    new Date(t).toLocaleDateString(tag, { month: 'long', year: 'numeric' });
  const a = f(Math.min(...times));
  const b = f(Math.max(...times));
  return a === b ? a : `${a} – ${b}`;
}

/* --- Page ------------------------------------------------------------------ */

/**
 * Page carte complète, ou `null` si aucune photo n'est géolocalisée.
 * `background` = fond des pages de l'album (le texte s'y adapte s'il est sombre).
 */
export function buildMapModel(
  photos: Photo[],
  typeface: Typeface,
  background: string,
  lang: Lang = 'fr',
  /** Hauteur de la page (unités de mise en page, cf. `pageFormat.ts`). */
  pageH: number = COVER_H,
): MapModel | null {
  const places = collectPlaces(photos, lang);
  if (!places.length) return null;
  const D = dict(lang).doc;
  const spec = TYPE_SPECS[typeface];
  const dark = isDark(background);
  const ink = dark ? '#f3efe7' : '#1f1d1a';
  const muted = mutedInk(background);
  const soft = dark ? '#cbc5b8' : '#6b6456';
  const accent = dark ? '#e3a455' : '#b45309';
  const items: MapItem[] = [];
  const text = (t: Omit<MapText, 'kind'>) => items.push({ kind: 'text', ...t });
  const shape = (s: Omit<MapShape, 'kind'>) => items.push({ kind: 'shape', ...s });

  // --- En-tête
  const titleText = spec.uppercaseTitle ? D.mapTitle.toUpperCase() : D.mapTitle;
  text({
    x: COVER_W / 2,
    y: 78,
    text: titleText,
    size: (spec.uppercaseTitle ? 28 : 34) * spec.titleScale,
    bold: true,
    fam: spec.title,
    anchor: 'middle',
    color: ink,
    spacing: spec.uppercaseTitle ? 1.5 : 0,
  });
  const countries = [...new Set(places.map((p) => p.country).filter(Boolean))];
  const allTimes = places.flatMap((p) => p.times);
  const sub = [countries.length && countries.length <= 2 ? countries.join(', ') : '', monthRange(allTimes, lang)]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
  text({
    x: COVER_W / 2,
    y: 106,
    text: fit(sub, 10, false, spec.meta, COVER_W - 120),
    size: 10,
    bold: false,
    fam: spec.meta,
    anchor: 'middle',
    color: accent,
    spacing: 2.5,
  });

  // --- Cadre de carte : la légende prend ce qu'il lui faut en dessous
  const compact = places.length > 8;
  const rowH = compact ? 30 : 36;
  // Page carrée : légende sur trois colonnes, sinon elle mangerait la carte.
  const cols = pageH < 700 ? 3 : 2;
  const rows = Math.ceil(places.length / cols);
  const box: MapRect = { x: 40, y: 128, w: 515, h: 0 };
  box.h = pageH - box.y - 26 - rows * rowH - 34;

  // --- Cadrage : les repères, étendus aux petites îles qui les portent (une
  // île coupée au bord du cadre fait « erreur »).
  let lon0 = Math.min(...places.map((p) => p.lon));
  let lon1 = Math.max(...places.map((p) => p.lon));
  let lat0 = Math.min(...places.map((p) => p.lat));
  let lat1 = Math.max(...places.map((p) => p.lat));
  for (const ring of landRings()) {
    if (ring.maxLon - ring.minLon > 3 || ring.maxLat - ring.minLat > 3) continue;
    if (places.some((p) => ringContains(ring, p.lon, p.lat))) {
      lon0 = Math.min(lon0, ring.minLon);
      lon1 = Math.max(lon1, ring.maxLon);
      lat0 = Math.min(lat0, ring.minLat);
      lat1 = Math.max(lat1, ring.maxLat);
    }
  }
  // Étendue minimale (~25 km) : un lieu unique ne doit pas zoomer sur une rue.
  const minR = 0.25 * RAD;
  const dx = Math.max((lon1 - lon0) * RAD, minR);
  const dy = Math.max(merc(lat1) - merc(lat0), minR);
  const pad = { x: 44, top: 62, bottom: 30 };
  const innerH = box.h - pad.top - pad.bottom;
  const s = Math.min((box.w - 2 * pad.x) / dx, innerH / dy);
  const proj = makeProj(
    (lon0 + lon1) / 2,
    (merc(lat0) + merc(lat1)) / 2,
    s,
    box.x + box.w / 2,
    box.y + pad.top + innerH / 2,
  );
  const clip = box;

  // --- Mer, vagues, terres (ombre décalée, sans flou : identique en Skia)
  shape({ d: rectPath(box), fill: SEA });
  let waves = '';
  for (let j = 0; box.y + 26 + j * 50 < box.y + box.h - 10; j++) {
    for (let i = 0; i < 7; i++) {
      const wx = box.x + 30 + i * 74 + (j % 2) * 37;
      const wy = box.y + 26 + j * 50;
      waves += `M${n1(wx)},${n1(wy)}Q${n1(wx + 6)},${n1(wy - 5)} ${n1(wx + 12)},${n1(wy)}Q${n1(wx + 18)},${n1(wy + 5)} ${n1(wx + 24)},${n1(wy)}`;
    }
  }
  shape({ d: waves, stroke: WAVE, width: 0.8, opacity: 0.7, clip });
  const land = landPath(proj, box, true, 2);
  if (land) {
    shape({ d: land, fill: '#5c4a2a', opacity: 0.22, clip, offset: [0, 2.5] });
    shape({ d: land, fill: LAND, stroke: COAST, width: 1.1, clip });
  }

  // --- Quadrillage discret (pas « rond » de 5 à 8 lignes sur la largeur)
  const lonA = proj.lonAt(box.x);
  const lonB = proj.lonAt(box.x + box.w);
  const latA = proj.latAt(box.y + box.h);
  const latB = proj.latAt(box.y);
  const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30];
  const step = steps.find((v) => (lonB - lonA) / v <= 8) ?? 30;
  let grid = '';
  for (let v = Math.ceil(lonA / step) * step; v < lonB; v += step) {
    const x = proj(v, 0)[0];
    grid += `M${n1(x)},${n1(box.y)}V${n1(box.y + box.h)}`;
  }
  for (let v = Math.ceil(latA / step) * step; v < latB; v += step) {
    const y = proj(0, v)[1];
    grid += `M${n1(box.x)},${n1(y)}H${n1(box.x + box.w)}`;
  }
  if (grid) shape({ d: grid, stroke: MAP_INK, width: 0.4, opacity: 0.18, dash: [2, 3], clip });

  // --- Repères (positions d'abord : le médaillon et les étiquettes les évitent)
  const PIN_S = 1.6;
  const xy = places.map((p) => proj(p.lon, p.lat));
  const taken: MapRect[] = xy.map(([x, y]) => ({ x: x - 16, y: y - 40, w: 32, h: 44 }));

  // Rose des vents (haut droite) et échelle (bas gauche)
  const cx = box.x + box.w - 34;
  const cy = box.y + 40;
  taken.push({ x: cx - 22, y: cy - 36, w: 44, h: 62 });
  shape({ d: circlePath(cx, cy, 17), stroke: MAP_INK, width: 0.7, opacity: 0.6 });
  shape({ d: `M${cx},${cy - 22}L${cx + 5},${cy}L${cx},${cy + 4}L${cx - 5},${cy}Z`, fill: MAP_INK });
  shape({
    d: `M${cx},${cy + 22}L${cx + 5},${cy}L${cx},${cy - 4}L${cx - 5},${cy}Z`,
    stroke: MAP_INK,
    width: 0.8,
  });
  shape({
    d: `M${cx - 15},${cy}L${cx},${cy + 3}L${cx + 15},${cy}L${cx},${cy - 3}Z`,
    stroke: MAP_INK,
    width: 0.7,
  });
  text({ x: cx, y: cy - 26, text: 'N', size: 9, bold: true, fam: spec.meta, anchor: 'middle', color: MAP_INK });

  const latMid = places.reduce((a, p) => a + p.lat, 0) / places.length;
  const kmPerPt = (6371 * Math.cos(latMid * RAD)) / s;
  const target = (box.w / 5) * kmPerPt;
  const nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].reduce((a, b) =>
    Math.abs(b - target) < Math.abs(a - target) ? b : a,
  );
  const sl = nice / kmPerPt;
  const sx = box.x + 16;
  const sy = box.y + box.h - 18;
  const scaleBg: MapRect = { x: sx - 6, y: sy - 18, w: sl + 12, h: 28 };
  taken.push(scaleBg);
  shape({ d: rectPath(scaleBg, 4), fill: LABEL_BG, opacity: 0.85 });
  shape({
    d: `M${n1(sx)},${sy}H${n1(sx + sl)}M${n1(sx)},${sy - 4}V${sy + 4}M${n1(sx + sl)},${sy - 4}V${sy + 4}`,
    stroke: MAP_INK,
    width: 1.4,
  });
  text({
    x: sx + sl / 2,
    y: sy - 6,
    text: nice < 1 ? `${nice * 1000} m` : `${nice} km`,
    size: 8,
    bold: false,
    fam: spec.meta,
    anchor: 'middle',
    color: MAP_INK,
    spacing: 0.5,
  });

  // --- Médaillon de situation : seulement pour une vue régionale, en bas à
  // droite ou en haut à gauche, là où il ne cache aucun repère.
  if (lonB - lonA < 8 && latB - latA < 8) {
    const iw = 138;
    const ih = 116;
    const spots: MapRect[] = [
      { x: box.x + box.w - iw - 12, y: box.y + box.h - ih - 12, w: iw, h: ih },
      { x: box.x + 12, y: box.y + 12, w: iw, h: ih },
    ];
    const ibox = spots.find((r) => !taken.some((t) => overlaps(r, t, 4)));
    if (ibox) {
      taken.push(ibox);
      // ~30° de large autour du centre de la vue : assez pour reconnaître la
      // région, même pour une île loin des côtes (Madère + Portugal + Maroc).
      const si = ibox.w / (30 * RAD);
      const iproj = makeProj(
        (lonA + lonB) / 2,
        (merc(latA) + merc(latB)) / 2,
        si,
        ibox.x + ibox.w / 2,
        ibox.y + ibox.h / 2,
      );
      shape({ d: rectPath(ibox), fill: SEA, stroke: MAP_INK, width: 1, clip });
      const iland = landPath(iproj, ibox, false, 0.8);
      if (iland) shape({ d: iland, fill: LAND, stroke: COAST, width: 0.5, clip: ibox });
      const [ax, ay] = iproj(lonA, latB);
      const [bx, by] = iproj(lonB, latA);
      const vw = Math.max(bx - ax, 4);
      const vh = Math.max(by - ay, 4);
      shape({
        d: rectPath({ x: (ax + bx) / 2 - vw / 2, y: (ay + by) / 2 - vh / 2, w: vw, h: vh }),
        stroke: PIN,
        width: 1.4,
        clip: ibox,
      });
    }
  }

  // --- Étiquettes : à droite, à gauche, au-dessus puis au-dessous du repère,
  // première place libre dans le cadre.
  const LBL = 11;
  const lblFam: FontFam = spec.meta;
  places.forEach((p, i) => {
    const [x, y] = xy[i];
    const name = fit(p.name, LBL, true, lblFam, 170);
    const w = textWidth(name, LBL, true, lblFam) + 8;
    const h = 18;
    const cands: MapRect[] = [
      { x: x + 18, y: y - 36, w, h },
      { x: x - 18 - w, y: y - 36, w, h },
      { x: x - w / 2, y: y - 62, w, h },
      { x: x - w / 2, y: y + 6, w, h },
    ];
    const others = taken.filter((_, k) => k !== i);
    const r =
      cands.find((c) => within(c, box, 4) && !others.some((t) => overlaps(c, t))) ??
      cands.find((c) => within(c, box, 4)) ??
      cands[0];
    taken.push(r);
    shape({ d: rectPath(r, 3), fill: LABEL_BG, opacity: 0.85, clip });
    text({ x: r.x + 4, y: r.y + 13, text: name, size: LBL, bold: true, fam: lblFam, anchor: 'start', color: MAP_INK });
  });

  // --- Repères par-dessus tout le reste
  places.forEach((p, i) => {
    const [x, y] = xy[i];
    const P = (u: number, v: number) => `${n1(x + u * PIN_S)},${n1(y + v * PIN_S)}`;
    shape({
      d: `M${P(0, 2)}C${P(-9, -10)} ${P(-9, -22)} ${P(0, -22)}C${P(9, -22)} ${P(9, -10)} ${P(0, 2)}Z`,
      fill: PIN,
      stroke: '#ffffff',
      width: 1.8,
      clip,
    });
    shape({ d: circlePath(x, y - 13 * PIN_S, 6.2 * PIN_S), fill: '#ffffff', clip });
    text({
      x,
      y: y - 9.6 * PIN_S,
      text: String(p.n),
      size: (p.n >= 10 ? 7.5 : 9) * PIN_S,
      bold: true,
      fam: lblFam,
      anchor: 'middle',
      color: PIN,
    });
  });

  // --- Cadre (double filet, façon gravure)
  shape({ d: rectPath(box), stroke: MAP_INK, width: 1.4 });
  // Filet extérieur posé sur la page : à la couleur de son texte (fond sombre).
  shape({ d: rectPath({ x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 8 }), stroke: ink, width: 0.6 });

  // --- Légende : deux colonnes, nom en gras puis les dates
  const colW = box.w / cols;
  const top = box.y + box.h + 26;
  const nameSize = compact ? 11 : 12;
  const dateSize = compact ? 9.5 : 10;
  places.forEach((p, i) => {
    const lx = box.x + (i % cols) * colW;
    const rt = top + Math.floor(i / cols) * rowH;
    shape({ d: circlePath(lx + 10, rt + 8, 9.5), fill: accent });
    text({
      x: lx + 10,
      y: rt + 11.5,
      text: String(p.n),
      size: p.n >= 10 ? 8.5 : 10,
      bold: true,
      fam: spec.meta,
      anchor: 'middle',
      color: '#ffffff',
    });
    text({
      x: lx + 28,
      y: rt + 12,
      text: fit(p.name, nameSize, true, spec.meta, colW - 40),
      size: nameSize,
      bold: true,
      fam: spec.meta,
      anchor: 'start',
      color: ink,
    });
    text({
      x: lx + 28,
      y: rt + (compact ? 24 : 27),
      text: fit(placeDates(p.times, lang), dateSize, false, spec.meta, colW - 40),
      size: dateSize,
      bold: false,
      fam: spec.meta,
      anchor: 'start',
      color: soft,
    });
  });

  text({
    x: COVER_W / 2,
    y: pageH - 18,
    text: D.mapCredit.toUpperCase(),
    size: 6.5,
    bold: false,
    fam: spec.meta,
    anchor: 'middle',
    color: muted,
    spacing: 1,
  });

  return { items };
}

/* --------------------------------------------------------------------------
 * Carte à côté d'une photo
 * ------------------------------------------------------------------------ */

/**
 * Part de la largeur de l'image donnée à la carte quand une photo a la sienne
 * (le reste à la photo), et blanc entre les deux — en points A4 (Skia × k).
 */
export const MAP_SHARE = 0.4;
export const MAP_GAP = 6;
/** Médaillon de carte posé sur une photo pleine page (points A4). */
export const FULL_MAP = { w: 168, h: 112, margin: 18, border: 4 };

/** Repère `MINI_W × MINI_H` de la carte : l'image ou le dessin y est cadré « cover ». */
export const MINI_W = 600;
export const MINI_H = 400;
/** Largeur au sol d'une carte Apple Plans (m) : une île comme Madère, un pays de vignes. */
export const MINI_SPAN_M = 40000;
/** Carte de secours hors ligne : plus large, faute de noms et de relief. */
const MINI_FALLBACK_KM = 150;

/**
 * Carte stylisée hors ligne d'un lieu (sans le repère), dans le repère
 * `MINI_W × MINI_H` : Android (pas de clé Google), ou iPhone sans réseau au
 * moment de l'export. Mêmes couleurs que la page « Nos lieux de visite ».
 */
export function buildMiniMapModel(lat: number, lon: number): MapModel {
  const box: MapRect = { x: 0, y: 0, w: MINI_W, h: MINI_H };
  // Points par radian de longitude pour couvrir MINI_FALLBACK_KM sur la largeur.
  const s = (MINI_W * 6371 * Math.cos(lat * RAD)) / MINI_FALLBACK_KM;
  const proj = makeProj(lon, merc(lat), s, MINI_W / 2, MINI_H / 2);
  const items: MapItem[] = [{ kind: 'shape', d: rectPath(box), fill: SEA }];
  let waves = '';
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const wx = 24 + i * 74 + (j % 2) * 37;
      const wy = 24 + j * 50;
      waves += `M${wx},${wy}Q${wx + 6},${wy - 5} ${wx + 12},${wy}Q${wx + 18},${wy + 5} ${wx + 24},${wy}`;
    }
  }
  items.push({ kind: 'shape', d: waves, stroke: WAVE, width: 1, opacity: 0.7, clip: box });
  const land = landPath(proj, box, true, 1.5);
  if (land) {
    items.push({ kind: 'shape', d: land, fill: '#5c4a2a', opacity: 0.2, clip: box, offset: [0, 3] });
    items.push({ kind: 'shape', d: land, fill: LAND, stroke: COAST, width: 1.4, clip: box });
  }
  return { items };
}

/** Repère d'une carte de photo, pointe en (x, y), à l'échelle `k` (1 = points A4). */
export function miniPinItems(x: number, y: number, k = 1): MapItem[] {
  const S = 1.15 * k;
  const P = (u: number, v: number) => `${n1(x + u * S)},${n1(y + v * S)}`;
  return [
    {
      kind: 'shape',
      d: `M${P(0, 0)}C${P(-9, -12)} ${P(-9, -24)} ${P(0, -24)}C${P(9, -24)} ${P(9, -12)} ${P(0, 0)}Z`,
      fill: PIN,
      stroke: '#ffffff',
      width: 1.6 * k,
    },
    { kind: 'shape', d: circlePath(x, y - 15 * S, 3.6 * S), fill: '#ffffff' },
  ];
}

/** Vrai si la couleur (hex 6 chiffres) est sombre (même règle que les moteurs). */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

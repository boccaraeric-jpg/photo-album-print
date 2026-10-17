"""Génère src/worldLand.ts : les terres émergées du monde, pour la page carte.

Source : Natural Earth 1:10m (domaine public), `ne_10m_land` + `ne_10m_minor_islands`
(les petites îles sont dans le second fichier). Télécharger les deux GeoJSON depuis
https://github.com/nvkelso/natural-earth-vector/tree/master/geojson dans un dossier,
puis :

    python design/build-worldmap.py <dossier-geojson>

Traitement : simplification Douglas-Peucker (TOL degrés, TOL_ISLAND pour les petites îles), quantification à 1/Q degré,
coordonnées en différences successives codées en entiers variables (5 bits utiles par
caractère, alphabet base64url). Décodage : `src/worldMap.ts`.
"""
import json
import math
import os
import sys

TOL = 0.005  # ≈ 500 m pour les continents et grandes îles
TOL_ISLAND = 0.0008  # ≈ 80 m sous 3° d'étendue : une île cadrée en entier (Madère) garde son relief
Q = 500  # 1/500 de degré ≈ 200 m
ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        best, best_i = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = (abs(dy * px - dx * py + bx * ay - by * ax) / length
                 if length else math.hypot(px - ax, py - ay))
            if d > best:
                best, best_i = d, i
        if best > tol:
            keep[best_i] = True
            stack += [(a, best_i), (best_i, b)]
    return [p for p, k in zip(pts, keep) if k]


def varint(n):
    """Entier signé → caractères (zigzag, 5 bits + bit de continuation)."""
    z = (n << 1) ^ (n >> 63) if n < 0 else n << 1
    z &= (1 << 64) - 1
    out = ''
    while True:
        chunk = z & 31
        z >>= 5
        if z:
            out += ALPHABET[chunk | 32]
        else:
            out += ALPHABET[chunk]
            return out


def main(src):
    rings = []
    for name in ('ne_10m_land', 'ne_10m_minor_islands'):
        with open(os.path.join(src, f'{name}.geojson'), encoding='utf8') as f:
            data = json.load(f)
        for feature in data['features']:
            geom = feature['geometry']
            polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
            rings += [poly[0] for poly in polys]

    encoded = []
    count = 0
    for ring in rings:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        small = max(xs) - min(xs) < 3 and max(ys) - min(ys) < 3
        pts = douglas_peucker(ring, TOL_ISLAND if small else TOL)
        if pts and pts[0] == pts[-1]:
            pts = pts[:-1]
        q = []
        for lon, lat in pts:
            p = (round((lon + 180) * Q), round((lat + 90) * Q))
            if not q or p != q[-1]:
                q.append(p)
        if len(q) < 3:
            continue
        s = varint(len(q))
        px = py = 0
        for x, y in q:
            s += varint(x - px) + varint(y - py)
            px, py = x, y
        encoded.append(s)
        count += len(q)

    body = ''.join(encoded)
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'worldLand.ts')
    with open(out, 'w', encoding='utf8', newline='\n') as f:
        f.write(
            '// Terres émergées du monde (Natural Earth 1:10m, domaine public), pour la\n'
            '// page carte de l\'album. Généré par design/build-worldmap.py — ne pas éditer.\n'
            f'// {len(encoded)} contours, {count} points, 1/{Q}° ; décodage : worldMap.ts.\n'
            '/* eslint-disable */\n'
            f'export const LAND_Q = {Q};\n'
            f"export const LAND_DATA = '{body}';\n"
        )
    print(f'{len(encoded)} contours, {count} points, {len(body) / 1e6:.2f} Mo')


if __name__ == '__main__':
    main(sys.argv[1])

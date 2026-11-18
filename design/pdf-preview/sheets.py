"""Planches-contact d'un PDF d'album + détection des pages blanches.

    python -I sheets.py <album.pdf> <dossier de sortie> [colonnes] [lignes] [largeur d'une page en px]

Écrit planche-01.png, planche-02.png… et signale toute page sans image et presque
sans texte (hors dos de l'album) : c'est la panne type d'une hauteur de fiche mal estimée (`proEntryHeight`)
ou d'une feuille qui déborde d'une fraction d'unité.
"""
import os
import sys

import pymupdf

sys.stdout.reconfigure(encoding="utf-8")

pdf, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
rows = int(sys.argv[4]) if len(sys.argv) > 4 else 2
cw = int(sys.argv[5]) if len(sys.argv) > 5 else 420
gap = 8

doc = pymupdf.open(pdf)
rect = doc[0].rect
ch = int(cw * rect.height / rect.width)
per = cols * rows

for start in range(0, len(doc), per):
    sheet = pymupdf.open()
    page = sheet.new_page(width=cols * cw + (cols + 1) * gap, height=rows * ch + (rows + 1) * gap)
    page.draw_rect(page.rect, fill=(0.35, 0.35, 0.35), color=None)
    for k in range(per):
        i = start + k
        if i >= len(doc):
            break
        x = gap + (k % cols) * (cw + gap)
        y = gap + (k // cols) * (ch + gap)
        page.show_pdf_page(pymupdf.Rect(x, y, x + cw, y + ch), doc, i)
    name = "planche-%02d.png" % (start // per + 1)
    page.get_pixmap().save(os.path.join(out, name))
    print("PNG    %s  (pages %d à %d)" % (name, start + 1, min(start + per, len(doc))))

print("%d pages de %.1f × %.1f pt" % (len(doc), rect.width, rect.height))
blank = [i + 1 for i, p in enumerate(doc) if not p.get_images() and len(p.get_text().strip()) < 80]
# Le dos d'un album Loisir (titre + période, sans photo) est normal : on le dit à part.
back = blank and blank[-1] == len(doc)
inside = blank[:-1] if back else blank
if inside:
    print("⚠ pages sans image et presque sans texte : %s" % ", ".join(map(str, inside)))
if back:
    print("  dernière page sans image : normal si c'est le dos de l'album, anomalie sinon")

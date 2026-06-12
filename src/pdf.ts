import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ExportOptions, Photo } from './types';
import { readBase64 } from './photoFiles';

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  photoSize: 'medium',
  background: '#f6f1e9',
  frame: 'card',
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br/>');
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Période couverte par l'album (ex. « mai – juin 2026 »), pour la couverture. */
function formatRange(photos: Photo[]): string {
  const times = photos.map((p) => p.createdAt);
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  const monthYear = (d: Date) =>
    d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return monthYear(first) === monthYear(last)
    ? monthYear(first)
    : `${monthYear(first)} – ${monthYear(last)}`;
}

/** Vrai si la couleur (hex 6 chiffres) est sombre — pour adapter le texte. */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

interface Item {
  photo: Photo;
  src: string;
}

/** Au-delà de cette longueur, le commentaire vaut à sa photo une page entière. */
const LONG_COMMENT = 160;

function isLong(item: Item): boolean {
  return item.photo.comment.trim().length > LONG_COMMENT;
}

/**
 * Répartit les photos en pages de `perPage` (commentaire en pied de photo).
 * Une photo au commentaire très long obtient sa page à elle, pour laisser
 * la place au texte.
 */
function paginate(items: Item[], perPage: number): Item[][] {
  if (perPage <= 1) return items.map((item) => [item]);
  const pages: Item[][] = [];
  let i = 0;
  while (i < items.length) {
    if (isLong(items[i])) {
      pages.push([items[i]]);
      i++;
      continue;
    }
    const group: Item[] = [];
    while (group.length < perPage && i < items.length && !isLong(items[i])) {
      group.push(items[i]);
      i++;
    }
    pages.push(group);
  }
  return pages;
}

function figureHtml(item: Item, variant: '' | 'solo' | 'large'): string {
  const { photo, src } = item;
  const comment = photo.comment.trim();
  const img = src
    ? `<img src="${src}" />`
    : '<span class="missing">Image indisponible</span>';
  return `
    <figure class="card ${variant}">
      <div class="ph">${img}</div>
      <figcaption class="caption">
        ${comment ? escapeHtml(comment) : ''}
        <span class="date">${escapeHtml(formatDate(photo.createdAt))}</span>
      </figcaption>
    </figure>`;
}

function pageHtml(
  group: Item[],
  perPage: number,
  title: string,
  pageNo: number,
): string {
  // Page d'une seule photo : « large » si c'est la taille choisie,
  // « solo » si c'est une exception (commentaire long ou photo restante).
  const variant =
    group.length > 1 ? '' : perPage === 1 ? 'large' : 'solo';
  const figures = group.map((item) => figureHtml(item, variant)).join('');
  // En taille « petite », les photos s'organisent en grille 2 colonnes.
  const body =
    perPage === 4 && group.length > 1
      ? `<div class="grid4">${figures}</div>`
      : figures;
  return `
    <section class="sheet">
      ${body}
      <p class="footer"><span>${escapeHtml(title)}</span><span>${pageNo}</span></p>
    </section>`;
}

/**
 * Page A4 en points PDF (72 dpi) : les px CSS correspondent à ces unités,
 * ce qui permet de dimensionner les pages au pixel près. L'unité vh est
 * proscrite : elle dépend de la fenêtre du moteur de rendu, pas de la page,
 * et provoquait pages blanches et chevauchements.
 */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/** Hauteur de la zone image (px) selon la taille choisie. */
const PH_HEIGHTS: Record<ExportOptions['photoSize'], string> = {
  small: '170px',
  medium: '250px',
  large: '500px',
};

/** Petite = grille 2×2, moyenne = 2 empilées, grande = pleine page. */
const PER_PAGE: Record<ExportOptions['photoSize'], number> = {
  small: 4,
  medium: 2,
  large: 1,
};

/**
 * Construit la feuille de style du mini album à partir des options :
 * hauteurs fixes uniquement (jamais de flex vertical), pour que le contenu
 * ne déborde jamais sur la page suivante.
 */
function buildStyles(options: ExportOptions): string {
  const dark = isDark(options.background);
  // Couleurs de texte posées directement sur le fond de page.
  const ink = dark ? '#f3efe7' : '#1f1d1a';
  const muted = dark ? '#8f8a80' : '#a89f8d';
  const accent = dark ? '#e3a455' : '#b45309';

  const phHeight = PH_HEIGHTS[options.photoSize];
  const captionSize = options.photoSize === 'small' ? '11px' : '13px';
  const cardGap = options.photoSize === 'small' ? '12px' : '16px';

  // Encadré : les cadres à fond blanc gardent un texte sombre ; les cadres
  // transparents (bordure, sans cadre) héritent des couleurs de la page.
  let frameCss = '';
  let captionInk = '#2c2a26';
  let captionMuted = '#a89f8d';
  switch (options.frame) {
    case 'card':
      frameCss = `
        .card { background: #fff; border-radius: 16px; padding: 10px;
          box-shadow: 0 8px 22px rgba(0, 0, 0, ${dark ? '0.55' : '0.22'}); }
        .ph { border-radius: 10px; }`;
      break;
    case 'border':
      frameCss = `
        .card { border: 2px solid ${dark ? 'rgba(243,239,231,0.55)' : 'rgba(31,29,26,0.4)'};
          border-radius: 16px; padding: 10px; }
        .ph { border-radius: 8px; }`;
      captionInk = ink;
      captionMuted = muted;
      break;
    case 'polaroid':
      // Cadre blanc épais et photos légèrement inclinées, façon scrapbook.
      frameCss = `
        .card { background: #fff; border-radius: 3px; padding: 14px 14px 18px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, ${dark ? '0.6' : '0.28'}); }
        .card:nth-of-type(odd) { transform: rotate(-1.4deg); }
        .card:nth-of-type(even) { transform: rotate(1.1deg); }
        .ph { border-radius: 0; }
        .caption { text-align: center; }`;
      break;
    case 'none':
      frameCss = `
        .card { padding: 0; }
        .ph { border-radius: 14px; }`;
      captionInk = ink;
      captionMuted = muted;
      break;
  }

  return `
  * {
    box-sizing: border-box;
    /* Indispensable : sans cela, le moteur d'impression iOS supprime les
       couleurs de fond et les ombres du PDF. */
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact;
  }
  body {
    margin: 0; background: ${options.background}; color: ${ink};
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
  }
  figure { margin: 0; }
  /* Pas de hauteur imposée : le contenu (dimensionné en px, total < page)
     s'arrête avant le bas, et le saut de page force la suite. */
  .sheet { padding: 24px 28px 0; page-break-after: always; }
  .sheet:last-of-type { page-break-after: auto; }
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    margin: 6px 4px 0; font-size: 10px; letter-spacing: 2.5px;
    text-transform: uppercase; color: ${muted};
  }

  /* --- Couverture --- */
  .cover { text-align: center; }
  .cover-frame {
    height: 500px; border-radius: 26px; overflow: hidden;
    box-shadow: 0 8px 22px rgba(0, 0, 0, ${dark ? '0.5' : '0.16'});
  }
  .cover-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-kicker {
    margin: 26px 0 0; font-size: 11px; letter-spacing: 4px;
    color: ${accent}; font-weight: 700;
  }
  .cover h1 {
    margin: 8px 0 6px; font-family: Georgia, "Times New Roman", serif;
    font-weight: 400; font-size: 44px; color: ${ink};
  }
  .cover-sub { margin: 0 0 4px; font-size: 14px; color: ${muted}; }

  /* --- Pages photo : hauteurs fixes --- */
  .card { margin-bottom: ${cardGap}; }
  .grid4 { display: flex; flex-wrap: wrap; gap: 12px; }
  .grid4 .card { width: calc(50% - 6px); margin-bottom: 4px; }
  ${frameCss}
  .ph {
    height: ${phHeight}; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(31,29,26,0.05)'};
  }
  .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card.solo .ph { height: 380px; }
  .card.solo .ph img { object-fit: contain; }
  .card.large .ph { height: 480px; }
  .card.large .ph img { object-fit: contain; }
  .missing { color: ${muted}; font-style: italic; font-size: 13px; }
  .caption {
    margin: 8px 4px 2px; font-size: ${captionSize}; line-height: 1.45;
    color: ${captionInk};
  }
  .caption .date {
    display: block; margin-top: 3px; font-size: 9px;
    letter-spacing: 2px; text-transform: uppercase; color: ${captionMuted};
  }

  /* --- Page de fin --- */
  .end { text-align: center; padding-top: 330px; }
  .end .orn { font-size: 22px; color: ${accent}; margin: 0; }
  .end h2 {
    font-family: Georgia, "Times New Roman", serif; font-weight: 400;
    font-size: 26px; margin: 12px 0 6px; color: ${ink};
  }
  .end p { color: ${muted}; font-size: 13px; margin: 0; }
`;
}

/**
 * Génère le mini album photo du dossier en PDF — couverture, pages photo
 * personnalisables (taille, fond, encadré) et page de fin — puis ouvre la
 * feuille de partage pour l'envoyer à un service d'impression, par email
 * ou AirDrop.
 *
 * @returns l'URI du PDF généré, ou null si aucune photo.
 */
export async function exportAlbumPdf(
  photos: Photo[],
  title: string,
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
  coverPhotoId?: string,
): Promise<string | null> {
  if (photos.length === 0) return null;

  const items: Item[] = await Promise.all(
    photos.map(async (photo) => {
      try {
        const b64 = await readBase64(photo.uri);
        return { photo, src: `data:image/jpeg;base64,${b64}` };
      } catch {
        return { photo, src: '' };
      }
    }),
  );

  const range = formatRange(photos);
  const subtitle = `${photos.length} photo${photos.length > 1 ? 's' : ''} · ${range}`;
  // Photo de couverture : celle choisie par l'utilisateur (étoile),
  // sinon la première photo lisible du dossier.
  const coverSrc =
    items.find((it) => it.photo.id === coverPhotoId && it.src)?.src ??
    items.find((it) => it.src)?.src ??
    '';
  const perPage = PER_PAGE[options.photoSize];

  const pages = paginate(items, perPage)
    .map((group, index) => pageHtml(group, perPage, title, index + 1))
    .join('');

  const html = `<!DOCTYPE html>
    <html lang="fr">
      <head><meta charset="utf-8" /><style>${buildStyles(options)}</style></head>
      <body>
        <section class="sheet cover">
          <div class="cover-frame">${coverSrc ? `<img src="${coverSrc}" />` : ''}</div>
          <p class="cover-kicker">ALBUM PHOTO</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="cover-sub">${escapeHtml(subtitle)}</p>
        </section>
        ${pages}
        <section class="sheet end">
          <p class="orn">✦</p>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </section>
      </body>
    </html>`;

  const { uri } = await Print.printToFileAsync({
    html,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Envoyer « ${title} »`,
      UTI: 'com.adobe.pdf',
    });
  }

  return uri;
}

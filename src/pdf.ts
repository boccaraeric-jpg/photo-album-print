import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { ExportOptions, Photo } from './types';
import { readBase64 } from './photoFiles';
import { fileDateStamp, formatPhotoDate, photoDate } from './dateFormat';
import { paginatePhotos, PER_PAGE } from './paginate';

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  style: 'family',
  photoSize: 'medium',
  background: '#f6f1e9',
  frame: 'card',
  liseret: false,
  dateFormat: 'long',
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

/** Période couverte par l'album (ex. « mai – juin 2026 »), pour la couverture. */
function formatRange(photos: Photo[]): string {
  const times = photos.map(photoDate);
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

function figureHtml(
  item: Item,
  variant: '' | 'solo' | 'large',
  dateFormat: ExportOptions['dateFormat'],
): string {
  const { photo, src } = item;
  const comment = photo.comment.trim();
  const place = photo.place?.trim();
  const date = formatPhotoDate(photoDate(photo), dateFormat);
  const img = src
    ? `<img src="${src}" />`
    : '<span class="missing">Image indisponible</span>';
  const meta = [place, date].filter(Boolean).join(' · ');
  const caption =
    comment || meta
      ? `<figcaption class="caption">
          ${comment ? escapeHtml(comment) : ''}
          ${meta ? `<span class="date">${escapeHtml(meta)}</span>` : ''}
        </figcaption>`
      : '';
  return `
    <figure class="card ${variant}">
      <div class="ph">${img}</div>
      ${caption}
    </figure>`;
}

function pageHtml(
  group: Item[],
  perPage: number,
  title: string,
  pageNo: number,
  dateFormat: ExportOptions['dateFormat'],
): string {
  // Page d'une seule photo : « large » si c'est la taille choisie,
  // « solo » si c'est une exception (commentaire long ou photo restante).
  const variant = group.length > 1 ? '' : perPage === 1 ? 'large' : 'solo';
  const figures = group
    .map((item) => figureHtml(item, variant, dateFormat))
    .join('');
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
      // Cadre blanc épais, façon scrapbook. Les photos empilées (2 ou 4/page)
      // sont légèrement inclinées en alternance ; les photos seules (grande
      // taille ou page « solo ») restent DROITES et centrées.
      frameCss = `
        .card { background: #fff; border-radius: 3px; padding: 14px 14px 18px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, ${dark ? '0.6' : '0.28'}); }
        .card:not(.large):not(.solo):nth-of-type(odd) { transform: rotate(-1.4deg); }
        .card:not(.large):not(.solo):nth-of-type(even) { transform: rotate(1.1deg); }
        .card.large, .card.solo { transform: none; margin-left: auto; margin-right: auto; }
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
  .ph img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .card.solo { max-width: 460px; }
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
  ${
    options.liseret
      ? `/* Liseré (option additive) : l'image prend sa taille réelle (sans marges
            vides) et porte le trait, pour entourer la photo et non la boîte. Se
            combine avec n'importe quel support (carte, bordure, polaroïd, aucun). */
         .ph { background: transparent; }
         .ph img { width: auto; height: auto; max-width: 100%; max-height: 100%;
           box-sizing: border-box; border-radius: 2px;
           border: 1.5px solid ${dark ? 'rgba(243,239,231,0.75)' : 'rgba(20,24,31,0.6)'}; }`
      : ''
  }
`;
}

/**
 * Construit le HTML complet du mini album (couverture, pages photo, page de
 * fin), avec les images intégrées en base64. Réutilisé tel quel par l'aperçu
 * (WebView) et par la génération PDF, pour que l'aperçu soit fidèle au rendu.
 */
export async function buildAlbumHtml(
  photos: Photo[],
  title: string,
  options: ExportOptions,
  coverPhotoId?: string,
): Promise<string> {
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

  // Rendu professionnel : gabarit sobre imposé (fond blanc, photos numérotées,
  // date/heure + lieu + description), indépendant des réglages familiaux.
  if (options.style === 'pro') {
    return buildProDocument(items, title);
  }

  const range = formatRange(photos);
  const subtitle = `${photos.length} photo${photos.length > 1 ? 's' : ''} · ${range}`;
  // Photo de couverture : celle choisie par l'utilisateur (étoile),
  // sinon la première photo lisible du dossier.
  const coverSrc =
    items.find((it) => it.photo.id === coverPhotoId && it.src)?.src ??
    items.find((it) => it.src)?.src ??
    '';
  const perPage = PER_PAGE[options.photoSize];

  const pages = paginatePhotos(photos, perPage)
    .map((group, index) => {
      const groupItems = group.map(
        (photo) => items.find((it) => it.photo.id === photo.id)!,
      );
      return pageHtml(groupItems, perPage, title, index + 1, options.dateFormat);
    })
    .join('');

  return `<!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <!-- width = largeur de page A4 en points : l'aperçu WebView met la page
             à l'échelle de l'écran ; ignoré par expo-print (dimensions fournies). -->
        <meta name="viewport" content="width=${PAGE_WIDTH}, initial-scale=1" />
        <style>${buildStyles(options)}</style>
      </head>
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
}

/** Une ligne factuelle « Clé : valeur » du rapport professionnel. */
function proMeta(label: string, value: string): string {
  return `<div class="row"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function proEntryHtml(item: Item, number: number): string {
  const { photo, src } = item;
  const date = formatPhotoDate(photoDate(photo), 'full') || '—';
  const place = photo.place?.trim() || '—';
  const desc = photo.comment.trim() || '—';
  const img = src
    ? `<img src="${src}" />`
    : '<span class="missing">Image indisponible</span>';
  return `
    <article class="entry">
      <div class="num">Photo n° ${number}</div>
      <div class="frame">${img}</div>
      <dl class="meta">
        ${proMeta('Lieu', place)}
        ${proMeta('Date', date)}
        ${proMeta('Description', desc)}
      </dl>
    </article>`;
}

/**
 * Rapport photographique sobre (fond blanc, factuel). Mise en page en flux avec
 * `page-break-inside: avoid` sur chaque fiche : ~2 photos par page, sans jamais
 * tronquer une description (essentiel pour une expertise).
 */
function buildProDocument(items: Item[], title: string): string {
  const number = new Map(items.map((it, i) => [it.photo.id, i + 1]));
  const entries = items
    .map((it) => proEntryHtml(it, number.get(it.photo.id)!))
    .join('');
  const today = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const styles = `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact; }
    body { margin: 0; background: #ffffff; color: #14181f;
      font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 12px; }
    .cover { padding: 96px 56px 0; page-break-after: always; }
    .cover .kicker { font-size: 12px; letter-spacing: 5px; color: #6b7280; font-weight: 700; }
    .cover h1 { font-size: 34px; font-weight: 700; margin: 10px 0 18px; color: #111827; }
    .cover .rule { height: 2px; background: #111827; width: 64px; margin-bottom: 26px; }
    .cover .row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #eef0f3; }
    .cover dt { width: 150px; color: #6b7280; margin: 0; }
    .cover dd { margin: 0; font-weight: 600; }
    .pages { padding: 40px 56px; }
    .entry { page-break-inside: avoid; margin-bottom: 28px; }
    .num { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 8px;
      letter-spacing: 0.5px; }
    .frame { border: 1px solid #d7dbe0; border-radius: 4px; height: 300px; overflow: hidden;
      display: flex; align-items: center; justify-content: center; background: #f8f9fa; }
    .frame img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .missing { color: #9ca3af; font-style: italic; }
    .meta { margin: 12px 0 0; }
    .meta .row { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #f1f2f4; }
    .meta dt { width: 96px; flex-shrink: 0; color: #6b7280; margin: 0; text-transform: uppercase;
      font-size: 10px; letter-spacing: 1px; padding-top: 2px; }
    .meta dd { margin: 0; color: #14181f; line-height: 1.5; }`;

  return `<!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=${PAGE_WIDTH}, initial-scale=1" />
        <style>${styles}</style>
      </head>
      <body>
        <section class="cover">
          <div class="kicker">RAPPORT PHOTOGRAPHIQUE</div>
          <h1>${escapeHtml(title)}</h1>
          <div class="rule"></div>
          <dl>
            ${proMeta('Établi le', today)}
            ${proMeta('Nombre de photos', String(items.length))}
          </dl>
        </section>
        <main class="pages">${entries}</main>
      </body>
    </html>`;
}

/** Base de nom de fichier « Titre JJ-MM-AAAA » (sans caractères interdits). */
export function albumFileBase(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safe || 'Album'} ${fileDateStamp()}`;
}

/**
 * Rend le HTML en PDF puis copie le fichier vers un nom lisible
 * (« Nom de l'album JJ-MM-AAAA.pdf ») pour qu'il soit identifiable au partage.
 * @returns l'URI du PDF nommé.
 */
export async function htmlToPdfFile(html: string, title: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  });
  const dest = `${FileSystem.cacheDirectory}${albumFileBase(title)}.pdf`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    // En cas d'échec de renommage, on partage au moins le PDF d'origine.
    return uri;
  }
}

/** Ouvre la feuille de partage iOS pour un fichier généré. */
export async function shareFile(
  uri: string,
  title: string,
  mimeType: string,
  UTI: string,
): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: `Envoyer « ${title} »`,
      UTI,
    });
  }
}

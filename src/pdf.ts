import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { ExportOptions, Photo } from './types';
import { readPrintBase64 } from './photoFiles';
import { fileDateStamp, formatPhotoDate, photoDate } from './dateFormat';
import { dict, localeTag, type Lang } from './i18n';
import { paginateEntries, PER_PAGE } from './paginate';
import { MONTSERRAT_500, MONTSERRAT_800 } from './montserratFonts';
import { richToHtml } from './richText';

/** Déclarations @font-face Montserrat (500 corps + 800 titres) embarquées en
 *  base64, pour un rendu identique et hors-ligne dans le PDF/aperçu. */
const MONTSERRAT_FACE = `
  @font-face { font-family: 'Montserrat'; font-weight: 500; font-style: normal;
    src: url(data:font/ttf;base64,${MONTSERRAT_500}) format('truetype'); }
  @font-face { font-family: 'Montserrat'; font-weight: 800; font-style: normal;
    src: url(data:font/ttf;base64,${MONTSERRAT_800}) format('truetype'); }`;

/** Tronque un texte à `n` mots (pour la légende en pleine page). */
function limitWords(text: string, n: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= n ? text.trim() : `${words.slice(0, n).join(' ')}…`;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  style: 'family',
  photoSize: 'medium',
  background: '#f6f1e9',
  frame: 'card',
  liseret: false,
  showPlace: true,
  dateFormat: 'long',
  dateAlign: 'left',
  textAlign: 'center',
  commentVAlign: 'top',
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
function formatRange(photos: Photo[], lang: Lang): string {
  const times = photos.map(photoDate);
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));
  const monthYear = (d: Date) =>
    d.toLocaleDateString(localeTag(lang), { month: 'long', year: 'numeric' });
  return monthYear(first) === monthYear(last)
    ? monthYear(first)
    : `${monthYear(first)} – ${monthYear(last)}`;
}

/** Année ou plage d'années couverte par l'album (ex. « 2026 » ou « 2024 – 2026 »). */
function yearLabel(photos: Photo[]): string {
  const years = photos.map((p) => new Date(photoDate(p)).getFullYear());
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min} – ${max}`;
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
  showPlace: boolean,
  lang: Lang,
): string {
  const { photo, src } = item;
  const comment = photo.comment.trim();
  const place = showPlace ? photo.place?.trim() : undefined;
  const date = formatPhotoDate(photoDate(photo), dateFormat, lang);
  const img = src
    ? `<img src="${src}" />`
    : `<span class="missing">${dict(lang).doc.imageUnavailable}</span>`;
  const meta = [place, date].filter(Boolean).join(' · ');
  const caption =
    comment || meta
      ? `<figcaption class="caption">
          ${comment ? richToHtml(comment, escapeHtml) : ''}
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
  showPlace: boolean,
  lang: Lang,
): string {
  // Page d'une seule photo : « large » si c'est la taille choisie,
  // « solo » si c'est une exception (commentaire long ou photo restante).
  const variant = group.length > 1 ? '' : perPage === 1 ? 'large' : 'solo';
  const figures = group
    .map((item) => figureHtml(item, variant, dateFormat, showPlace, lang))
    .join('');
  // En taille « petite », les photos s'organisent en grille 2 colonnes.
  const body =
    perPage === 4 && group.length > 1
      ? `<div class="grid4">${figures}</div>`
      : figures;
  return `
    <section class="sheet">
      ${body}
      <p class="footer"><span>${pageNo}</span></p>
    </section>`;
}

/** Photo pleine page (bord à bord) + légende courte (≤ 15 mots) en pied. */
function fullPageHtml(item: Item, lang: Lang): string {
  const { photo, src } = item;
  const comment = limitWords(photo.comment, 15);
  const img = src
    ? `<img src="${src}" />`
    : `<span class="missing">${dict(lang).doc.imageUnavailable}</span>`;
  return `
    <section class="sheet full-sheet">
      <div class="full-img">${img}</div>
      <div class="full-cap">${comment ? richToHtml(comment, escapeHtml) : ''}</div>
    </section>`;
}

/** Page de texte seule (intro, dédicace, séparateur…). */
function textPageHtml(item: Photo, title: string, pageNo: number): string {
  const text = escapeHtml(item.comment.trim()).replace(/\n/g, '<br/>');
  return `
    <section class="sheet textpage">
      <div class="textpage-body">${text}</div>
      <p class="footer"><span>${pageNo}</span></p>
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
/**
 * Hauteur de la bande réservée au commentaire quand il est centré ou aligné en
 * bas (≈ 2 lignes de légende + la ligne date/lieu). En position « haut » aucune
 * bande n'est posée : la légende coule comme avant, rendu strictement identique.
 */
const CAPTION_BANDS: Record<ExportOptions['photoSize'], number> = {
  small: 58,
  medium: 66,
  large: 66,
  full: 0, // la pleine page a son propre bandeau (.full-cap)
};

/**
 * Hauteur qu'occupe déjà une légende d'une ligne. La bande ne coûte donc que la
 * différence, retranchée à la photo : la carte garde sa hauteur et la
 * pagination ne bouge pas (une page en plus casserait le montage).
 */
const CAPTION_BASES: Record<ExportOptions['photoSize'], number> = {
  small: 35,
  medium: 38,
  large: 38,
  full: 0,
};

const PH_HEIGHTS: Record<ExportOptions['photoSize'], string> = {
  small: '170px',
  medium: '250px',
  large: '500px',
  full: '500px', // non utilisé (la pleine page a son propre gabarit)
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

  // Position verticale du commentaire : « haut » = flux d'origine, sans bande.
  const vAlign = options.commentVAlign ?? 'top';
  const band = vAlign === 'top' ? 0 : CAPTION_BANDS[options.photoSize];
  // Ce que la bande coûte en plus d'une légende d'une ligne, pris sur la photo.
  const shrink = band ? band - CAPTION_BASES[options.photoSize] : 0;
  const phHeight = `${parseInt(PH_HEIGHTS[options.photoSize], 10) - shrink}px`;
  const captionSize = options.photoSize === 'small' ? '16px' : '18px';
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
  ${MONTSERRAT_FACE}
  * {
    box-sizing: border-box;
    /* Indispensable : sans cela, le moteur d'impression iOS supprime les
       couleurs de fond et les ombres du PDF. */
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact;
  }
  body {
    margin: 0; background: ${options.background}; color: ${ink};
    font-family: 'Montserrat', Georgia, serif; font-weight: 500;
  }
  figure { margin: 0; }
  /* Pas de hauteur imposée : le contenu (dimensionné en px, total < page)
     s'arrête avant le bas, et le saut de page force la suite. */
  .sheet { padding: 24px 28px 0; page-break-after: always; }
  .sheet:last-of-type { page-break-after: auto; }
  .footer {
    display: flex; justify-content: center; align-items: center;
    margin: 6px 4px 0; font-size: 10px; letter-spacing: 2.5px;
    text-transform: uppercase; color: ${muted};
  }

  /* --- 1ère de couverture (titre + année + montage, façon carnet) --- */
  .cover { position: relative; padding: 62px 46px 0; text-align: center; }
  .crop { position: absolute; width: 22px; height: 22px; border: 0 solid ${ink}; }
  .crop.tl { top: 26px; left: 26px; border-top-width: 1.5px; border-left-width: 1.5px; }
  .crop.tr { top: 26px; right: 26px; border-top-width: 1.5px; border-right-width: 1.5px; }
  .crop.bl { bottom: 26px; left: 26px; border-bottom-width: 1.5px; border-left-width: 1.5px; }
  .crop.br { bottom: 26px; right: 26px; border-bottom-width: 1.5px; border-right-width: 1.5px; }
  .cover-kicker {
    margin: 14px 0 0; font-family: "Courier New", monospace;
    font-size: 12px; letter-spacing: 5px; color: ${accent}; font-weight: 700;
  }
  .cover-title {
    margin: 16px 0 0; font-family: 'Montserrat', Georgia, serif;
    font-weight: 800; font-size: 58px; line-height: 1.04; letter-spacing: 0.5px; color: ${ink};
  }
  .cover-year {
    margin: 12px 0 0; font-family: 'Montserrat', Georgia, serif;
    font-size: 38px; letter-spacing: 3px; color: ${accent}; font-weight: 800;
  }
  .cover-hero {
    height: 470px; margin: 40px 0 0; overflow: hidden;
    border: 6px solid #fff; box-shadow: 0 8px 22px rgba(0, 0, 0, ${dark ? '0.55' : '0.22'});
  }
  .cover-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-foot {
    display: flex; justify-content: space-between; align-items: center;
    margin: 42px 6px 0; font-family: 'Montserrat', Georgia, serif;
    font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: ${muted};
  }
  .cover-foot .reg {
    width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid ${accent};
  }

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
  .card.solo .ph { height: ${380 - shrink}px; }
  .card.solo .ph img { object-fit: contain; }
  .card.large .ph { height: ${480 - shrink}px; }
  .card.large .ph img { object-fit: contain; }
  .missing { color: ${muted}; font-style: italic; font-size: 13px; }
  .caption {
    margin: 8px 4px 2px; font-size: ${captionSize}; line-height: 1.45;
    color: ${captionInk};
  }
  /* Bande de commentaire : hauteur MINIMALE (et non fixe), pour qu'un long
     commentaire continue de s'étendre au lieu d'être rogné. */
  ${
    band
      ? `.caption {
    min-height: ${band}px; display: flex; flex-direction: column;
    justify-content: ${vAlign === 'middle' ? 'center' : 'flex-end'};
  }`
      : ''
  }
  .caption strong { font-weight: 800; }
  .caption u, .meta u, .full-cap u { text-decoration: underline; }
  .caption .date {
    display: block; margin-top: 3px; font-size: 6.5px;
    text-align: ${options.dateAlign ?? 'left'};
    letter-spacing: 1px; text-transform: lowercase; font-weight: 500;
    color: ${dark ? '#cbc5b8' : '#6b6456'};
  }

  /* --- Photo pleine page (bord à bord) --- */
  .full-sheet { padding: 0; page-break-after: always; }
  .full-sheet:last-of-type { page-break-after: auto; }
  .full-img { height: 778px; overflow: hidden; }
  .full-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .full-cap {
    height: 64px; padding: 0 44px; display: flex; align-items: center; justify-content: center;
    font-size: 14px; line-height: 1.4; text-align: center; color: ${ink};
  }

  /* --- Page de texte seule (texte centré verticalement sur la page) --- */
  .textpage {
    position: relative; height: 842px; padding: 90px 60px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    page-break-after: always;
  }
  .textpage:last-of-type { page-break-after: auto; }
  .textpage .footer { position: absolute; left: 0; right: 0; bottom: 30px; margin: 0; }
  .textpage-body {
    font-family: 'Montserrat', Georgia, serif; font-size: 21px; line-height: 1.6;
    color: ${ink}; text-align: ${options.textAlign}; white-space: pre-wrap;
  }

  /* --- Page de fin --- */
  .end { text-align: center; padding-top: 330px; }
  .end .orn { font-size: 22px; color: ${accent}; margin: 0; }
  .end h2 {
    font-family: 'Montserrat', Georgia, serif; font-weight: 800;
    font-size: 26px; margin: 12px 0 6px; color: ${ink};
  }
  .end p { color: ${muted}; font-size: 13px; margin: 0; }
  ${
    options.liseret
      ? `/* Liseré BLANC (option additive) autour de CHAQUE photo : l'image prend
            sa taille réelle et porte une bordure blanche + une légère ombre pour
            rester visible sur tout fond. overflow:visible pour ne pas rogner
            l'ombre. Se combine avec n'importe quel support. */
         .ph { background: transparent; overflow: visible; }
         .ph img { width: auto; height: auto; max-width: 100%; max-height: 100%;
           box-sizing: border-box; border-radius: 2px;
           border: 6px solid #ffffff;
           box-shadow: 0 2px 8px rgba(0, 0, 0, ${dark ? '0.55' : '0.28'}); }`
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
  lang: Lang = 'fr',
): Promise<string> {
  // Budget adaptatif : plus il y a de photos, plus on réduit chacune pour que le
  // PDF final reste transmissible (cible ~10 Mo). À 1600 px / q0.72 une photo
  // pèse ~0,3 Mo, donc ~3 Mo pour 9 photos (contre ~190 Mo en original brut).
  const count = photos.filter((p) => p.kind !== 'text').length;
  const maxEdge = count > 30 ? 1024 : count > 15 ? 1280 : 1600;
  const quality = count > 30 ? 0.68 : 0.72;

  const items: Item[] = await Promise.all(
    photos.map(async (photo) => {
      if (photo.kind === 'text' || !photo.uri) return { photo, src: '' };
      try {
        const b64 = await readPrintBase64(photo.uri, maxEdge, quality);
        return { photo, src: `data:image/jpeg;base64,${b64}` };
      } catch {
        return { photo, src: '' };
      }
    }),
  );

  // Rendu professionnel : gabarit sobre (fond blanc, photos numérotées, lieu +
  // description). Réglages honorés en pro : encadrement, format et position de
  // la date, alignement des pages de texte. Le reste reste imposé.
  if (options.style === 'pro') {
    return buildProDocument(items, title, options, lang);
  }

  // Les pages de texte ne comptent pas comme des photos (couverture, année).
  const photoEntries = photos.filter((p) => p.kind !== 'text');
  const range = photoEntries.length ? formatRange(photoEntries, lang) : '';
  // Mode familial : on n'affiche pas le nombre total de photos (juste la période).
  const subtitle = range;
  // Photo de couverture : celle choisie par l'utilisateur (étoile),
  // sinon la première photo lisible du dossier.
  const coverItem =
    items.find((it) => it.photo.id === coverPhotoId && it.src) ??
    items.find((it) => it.src);
  const coverSrc = coverItem?.src ?? '';
  const perPage = PER_PAGE[options.photoSize];

  // La photo de couverture ne réapparaît dans les pages que si elle porte un
  // commentaire ; sinon elle n'est visible que sur la couverture.
  const coverPhoto = coverItem?.photo;
  const pageSource =
    coverPhoto && coverPhoto.comment.trim().length === 0
      ? photos.filter((p) => p.id !== coverPhoto.id)
      : photos;

  const pages = paginateEntries(pageSource, perPage)
    .map((page, index) => {
      const no = index + 1;
      if (page.type === 'text') return textPageHtml(page.item, title, no);
      const groupItems = page.items.map(
        (p) => items.find((it) => it.photo.id === p.id)!,
      );
      if (options.photoSize === 'full') return fullPageHtml(groupItems[0], lang);
      return pageHtml(
        groupItems,
        perPage,
        title,
        no,
        options.dateFormat,
        options.showPlace,
        lang,
      );
    })
    .join('');

  return `<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <!-- width = largeur de page A4 en points : l'aperçu WebView met la page
             à l'échelle de l'écran ; ignoré par expo-print (dimensions fournies). -->
        <meta name="viewport" content="width=${PAGE_WIDTH}, initial-scale=1" />
        <style>${buildStyles(options)}</style>
      </head>
      <body>
        <section class="sheet cover">
          <span class="crop tl"></span><span class="crop tr"></span>
          <span class="crop bl"></span><span class="crop br"></span>
          <h1 class="cover-title">${escapeHtml(title.toUpperCase())}</h1>
          <p class="cover-year">${escapeHtml(photoEntries.length ? yearLabel(photoEntries) : '')}</p>
          <div class="cover-hero">${coverSrc ? `<img src="${coverSrc}" />` : ''}</div>
          <div class="cover-foot">
            <span>${escapeHtml(subtitle)}</span>
            <span class="reg"></span>
          </div>
        </section>
        ${pages}
        <section class="sheet end">
          <p class="orn">✦</p>
          <p>${escapeHtml(subtitle)}</p>
        </section>
      </body>
    </html>`;
}

/** Une ligne factuelle « Clé : valeur » du rapport professionnel. */
function proMeta(label: string, value: string, cls = '', rich = false): string {
  const body = rich ? richToHtml(value, escapeHtml) : escapeHtml(value);
  return `<div class="row ${cls}"><dt>${label}</dt><dd>${body}</dd></div>`;
}

function proEntryHtml(
  item: Item,
  number: number,
  dateFormat: ExportOptions['dateFormat'],
  showPlace: boolean,
  lang: Lang,
): string {
  const { photo, src } = item;
  const D = dict(lang).doc;
  // « Aucune » retire la ligne de date entière, pas seulement sa valeur.
  const date =
    dateFormat === 'none'
      ? ''
      : formatPhotoDate(photoDate(photo), dateFormat, lang) || '—';
  // Comme la date, « Lieu » disparaît en entier quand l'option est décochée.
  const place = showPlace ? photo.place?.trim() || '—' : '';
  const desc = photo.comment.trim() || '—';
  const img = src
    ? `<img src="${src}" />`
    : `<span class="missing">${D.imageUnavailable}</span>`;
  return `
    <article class="entry">
      <div class="num">${D.photoNo(number)}</div>
      <div class="frame">${img}</div>
      <dl class="meta">
        ${place ? proMeta(D.place, place) : ''}
        ${date ? proMeta(D.date, date, 'date') : ''}
        ${proMeta(D.description, desc, '', true)}
      </dl>
    </article>`;
}

/** Page de texte seule dans le rapport professionnel (pleine page, sobre). */
function proTextPageHtml(item: Photo): string {
  const text = escapeHtml(item.comment.trim()).replace(/\n/g, '<br/>');
  return `<div class="pro-textpage">${text}</div>`;
}

/**
 * Rapport photographique sobre (fond blanc, factuel). Mise en page en flux avec
 * `page-break-inside: avoid` sur chaque fiche : ~2 photos par page, sans jamais
 * tronquer une description (essentiel pour une expertise).
 */
function buildProDocument(
  items: Item[],
  title: string,
  options: ExportOptions,
  lang: Lang,
): string {
  const { textAlign, dateAlign, dateFormat, showPlace } = options;
  // Les photos sont numérotées ; les pages de texte s'intercalent en pleine page.
  let photoNo = 0;
  const entries = items
    .map((it) =>
      it.photo.kind === 'text'
        ? proTextPageHtml(it.photo)
        : proEntryHtml(it, ++photoNo, dateFormat, showPlace, lang),
    )
    .join('');
  const today = new Date().toLocaleDateString(localeTag(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Encadrement des photos : seule la caisse change, la hauteur de la vignette
  // reste fixe pour ne pas déplacer les fiches d'une page à l'autre.
  const frameCss = {
    card: 'background: #f8f9fa; border: 0; border-radius: 6px;',
    border: 'background: #f8f9fa; border: 1px solid #d7dbe0; border-radius: 4px;',
    polaroid:
      'background: #ffffff; border: 1px solid #e5e7eb; border-radius: 2px; padding: 14px 14px 20px;',
    none: 'background: transparent; border: 0; border-radius: 0;',
  }[options.frame];

  const styles = `
    ${MONTSERRAT_FACE}
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact; }
    body { margin: 0; background: #ffffff; color: #14181f;
      font-family: 'Montserrat', Georgia, serif; font-size: 12px; }
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
    .frame { height: 300px; overflow: hidden;
      display: flex; align-items: center; justify-content: center; ${frameCss} }
    .frame img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    .missing { color: #9ca3af; font-style: italic; }
    .meta { margin: 12px 0 0; }
    .meta .row { display: flex; gap: 12px; padding: 5px 0; border-bottom: 1px solid #f1f2f4; }
    .meta dt { width: 96px; flex-shrink: 0; color: #6b7280; margin: 0; text-transform: uppercase;
      font-size: 10px; letter-spacing: 1px; padding-top: 2px; }
    .meta dd { margin: 0; color: #14181f; line-height: 1.5; }
    /* La valeur de date occupe toute la largeur restante pour que son
       alignement (gauche / centre / droite) soit visible. */
    .meta .row.date dd { flex: 1; text-align: ${dateAlign}; }
    .pro-textpage { page-break-before: always; page-break-after: always;
      padding: 64px 56px 0; text-align: ${textAlign}; white-space: pre-wrap;
      font-size: 20px; line-height: 1.7; color: #14181f; }`;

  const D = dict(lang).doc;
  return `<!DOCTYPE html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=${PAGE_WIDTH}, initial-scale=1" />
        <style>${styles}</style>
      </head>
      <body>
        <section class="cover">
          <h1>${escapeHtml(title)}</h1>
          <div class="rule"></div>
          <dl>
            ${proMeta(D.establishedOn, today)}
            ${proMeta(D.photoCountLabel, String(items.length))}
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
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && typeof info.size === 'number') {
      const mo = info.size / (1024 * 1024);
      if (mo > 10) {
        console.warn(`[pdf] PDF volumineux : ${mo.toFixed(1)} Mo (> 10 Mo)`);
      }
    }
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

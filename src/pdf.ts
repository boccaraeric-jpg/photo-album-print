import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Photo } from './types';
import { readBase64 } from './photoFiles';

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

async function buildPageHtml(photo: Photo, index: number): Promise<string> {
  let imgSrc = '';
  try {
    const b64 = await readBase64(photo.uri);
    imgSrc = `data:image/jpeg;base64,${b64}`;
  } catch {
    imgSrc = '';
  }

  const caption = photo.comment.trim()
    ? `<p class="caption">${escapeHtml(photo.comment)}</p>`
    : '<p class="caption caption-empty">(sans commentaire)</p>';

  return `
    <section class="page">
      <div class="photo-wrap">
        ${imgSrc ? `<img src="${imgSrc}" />` : '<div class="missing">Image indisponible</div>'}
      </div>
      ${caption}
      <p class="page-footer"><span>${escapeHtml(formatDate(photo.createdAt))}</span><span>${index + 1}</span></p>
    </section>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Helvetica Neue", sans-serif; color: #1c1c1e; }
  .cover {
    height: 95vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    page-break-after: always;
  }
  .cover h1 { font-size: 42px; margin: 0 0 12px; }
  .cover p { font-size: 18px; color: #6b7280; margin: 0; }
  .page {
    height: 95vh; display: flex; flex-direction: column;
    padding: 24px; page-break-after: always;
  }
  .photo-wrap { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
  .photo-wrap img { max-width: 100%; max-height: 100%; border-radius: 12px; object-fit: contain; }
  .missing { color: #9ca3af; font-style: italic; }
  .caption { font-size: 20px; line-height: 1.45; margin: 20px 4px 0; }
  .caption-empty { color: #9ca3af; font-style: italic; }
  .page-footer {
    display: flex; justify-content: space-between;
    font-size: 13px; color: #9ca3af; margin: 12px 4px 0;
  }
`;

/**
 * Génère un PDF de l'album (une photo + sa légende par page, avec page de
 * couverture) puis ouvre la feuille de partage iOS pour l'envoyer à un
 * service d'impression (Journi Print, etc.), par email ou par AirDrop.
 *
 * @returns l'URI du PDF généré, ou null si aucune photo.
 */
export async function exportAlbumPdf(photos: Photo[], title: string): Promise<string | null> {
  if (photos.length === 0) return null;

  const pages = await Promise.all(photos.map(buildPageHtml));

  const html = `<!DOCTYPE html>
    <html lang="fr">
      <head><meta charset="utf-8" /><style>${STYLES}</style></head>
      <body>
        <div class="cover">
          <h1>${escapeHtml(title)}</h1>
          <p>${photos.length} photo${photos.length > 1 ? 's' : ''}</p>
        </div>
        ${pages.join('')}
      </body>
    </html>`;

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Envoyer « ${title} »`,
      UTI: 'com.adobe.pdf',
    });
  }

  return uri;
}

import type { Lang } from './i18n';

/**
 * Taille lisible : « 842 Ko », « 38 Mo ». Base 1024, unités françaises (Ko/Mo/Go)
 * ou anglaises (KB/MB/GB) selon la langue de l'app.
 */
export function formatBytes(bytes: number, lang: Lang): string {
  const units = lang === 'fr' ? ['o', 'Ko', 'Mo', 'Go'] : ['B', 'KB', 'MB', 'GB'];
  if (bytes <= 0) return `0 ${units[0]}`;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  // Un chiffre après la virgule seulement sous 10 (« 8,4 Mo » mais « 38 Mo »).
  const rounded = value >= 10 || i === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  const text = lang === 'fr' ? String(rounded).replace('.', ',') : String(rounded);
  return `${text} ${units[i]}`;
}

import { File, Paths } from 'expo-file-system';

/**
 * Écriture d'une archive ZIP **en flux**, directement dans un fichier.
 *
 * Pourquoi pas JSZip, utilisé ailleurs dans l'app : JSZip construit l'archive
 * entière en mémoire, et l'ancienne API (`expo-file-system/legacy`) n'échange
 * qu'en base64 (+33 %). Pour « Photos (à réutiliser) », qui garde la pleine
 * résolution, 50 photos (~200 Mo) faisaient coexister plusieurs copies de
 * l'archive — près d'un gigaoctet : iOS tuait l'app après plusieurs minutes.
 *
 * Ici, chaque fichier est lu en octets (`File.bytes()` de la nouvelle API du
 * SDK 54), écrit à la suite dans l'archive, puis libéré : la mémoire n'excède
 * jamais un fichier. Les entrées sont **stockées sans compression** (méthode 0) :
 * des JPEG ne gagnent rien à être recompressés, et c'est ce qui coûtait le plus
 * de temps. Format ZIP classique (32 bits) : au plus 4 Go au total.
 */

/** Table CRC-32 (polynôme 0xEDB88320), calculée une fois. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

/** Date et heure au format MS-DOS, attendu par les en-têtes ZIP. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

const FLAG_UTF8 = 0x0800; // noms de fichiers en UTF-8 (accents des commentaires)
const VERSION = 20;
const MAX_ZIP32 = 0xffffffff;

export class ZipStreamWriter {
  private readonly file: File;
  private readonly handle: ReturnType<File['open']>;
  private readonly entries: CentralEntry[] = [];
  private readonly stamp = dosDateTime(new Date());
  private offset = 0;
  private readonly encoder = new TextEncoder();

  /** Crée (ou remplace) `fileName` dans le cache de l'app. */
  constructor(fileName: string) {
    this.file = new File(Paths.cache, fileName);
    this.file.create({ overwrite: true });
    this.handle = this.file.open();
  }

  /** Ajoute une entrée dont le contenu est déjà en mémoire. */
  addBytes(name: string, data: Uint8Array): void {
    const nameBytes = this.encoder.encode(name);
    if (this.offset + 30 + nameBytes.length + data.length > MAX_ZIP32) {
      throw new Error('ZIP > 4 Go');
    }
    const crc = crc32(data);

    const header = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true); // signature d'en-tête local
    v.setUint16(4, VERSION, true);
    v.setUint16(6, FLAG_UTF8, true);
    v.setUint16(8, 0, true); // méthode 0 = stocké
    v.setUint16(10, this.stamp.time, true);
    v.setUint16(12, this.stamp.date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true); // taille compressée
    v.setUint32(22, data.length, true); // taille d'origine
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true); // pas de champ « extra »
    header.set(nameBytes, 30);

    this.handle.writeBytes(header);
    this.handle.writeBytes(data);
    this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset });
    this.offset += header.length + data.length;
  }

  /** Ajoute un fichier du disque, lu en octets puis aussitôt libéré. */
  async addFile(name: string, uri: string): Promise<void> {
    const data = await new File(uri).bytes();
    this.addBytes(name, data);
  }

  /** Ajoute un fichier texte (UTF-8). */
  addText(name: string, text: string): void {
    this.addBytes(name, this.encoder.encode(text));
  }

  /** Écrit le répertoire central, ferme le fichier et renvoie son URI. */
  finish(): string {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.name.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, 0x02014b50, true); // signature d'entrée centrale
      v.setUint16(4, VERSION, true); // version créatrice
      v.setUint16(6, VERSION, true); // version requise
      v.setUint16(8, FLAG_UTF8, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, this.stamp.time, true);
      v.setUint16(14, this.stamp.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      // 30 extra, 32 commentaire, 34 disque, 36 attributs internes : 0
      v.setUint32(38, 0, true); // attributs externes
      v.setUint32(42, e.offset, true);
      rec.set(e.name, 46);
      this.handle.writeBytes(rec);
      this.offset += rec.length;
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true); // fin du répertoire central
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, this.offset - cdStart, true);
    v.setUint32(16, cdStart, true);
    this.handle.writeBytes(end);
    this.handle.close();
    return this.file.uri;
  }

  /** Abandon (erreur en cours de route) : ferme et supprime le fichier partiel. */
  abort(): void {
    try {
      this.handle.close();
    } catch {
      // déjà fermé
    }
    try {
      this.file.delete();
    } catch {
      // rien à supprimer
    }
  }
}

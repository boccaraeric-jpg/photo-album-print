import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Album } from '../types';
import { C, F } from '../theme';

interface Props {
  album: Album;
  /** Nombre de photos du dossier. */
  count: number;
  /** Vignette : URI de la première photo du dossier, s'il y en a une. */
  thumbUri?: string;
  onOpen: (album: Album) => void;
  onRename: (album: Album) => void;
  onDelete: (album: Album) => void;
}

export function AlbumCard({
  album,
  count,
  thumbUri,
  onOpen,
  onRename,
  onDelete,
}: Props) {
  return (
    <Pressable style={styles.card} onPress={() => onOpen(album)}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Text style={styles.thumbIcon}>📁</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {album.name.trim() || 'Sans nom'}
        </Text>
        <Text style={styles.count}>
          {count} photo{count > 1 ? 's' : ''}
        </Text>
        <Text style={styles.created}>
          Créé le{' '}
          {new Date(album.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.iconBtn}
          hitSlop={10}
          onPress={() => onRename(album)}
        >
          <Text style={styles.iconText}>✎</Text>
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          hitSlop={10}
          onPress={() => onDelete(album)}
        >
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    backgroundColor: C.tan,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon: { fontSize: 28 },
  body: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  name: {
    fontFamily: F.display,
    fontSize: 18,
    color: C.ink,
    marginLeft: -1, // compense le léger décalage à gauche de la police serif
  },
  count: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.muted,
    letterSpacing: 1,
    marginTop: 5,
  },
  created: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.faint,
    letterSpacing: 1,
    marginTop: 3,
  },
  actions: { gap: 8 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.tan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: C.inkSoft,
    fontSize: 14,
    fontWeight: '700',
  },
});

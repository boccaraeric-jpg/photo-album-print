import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Album } from '../types';

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
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon: { fontSize: 28 },
  body: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  count: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  actions: { gap: 8 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
  },
});

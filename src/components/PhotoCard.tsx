import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Photo } from '../types';

interface Props {
  photo: Photo;
  /** Vrai si cette photo est la couverture (choisie ou par défaut). */
  isCover: boolean;
  onEdit: (photo: Photo) => void;
  onSetCover: (photo: Photo) => void;
  onAdjust: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
}

export function PhotoCard({
  photo,
  isCover,
  onEdit,
  onSetCover,
  onAdjust,
  onDelete,
}: Props) {
  const hasComment = photo.comment.trim().length > 0;

  return (
    <Pressable style={styles.card} onPress={() => onEdit(photo)}>
      <Image source={{ uri: photo.uri }} style={styles.thumb} />
      <View style={styles.body}>
        <Text
          style={[styles.comment, !hasComment && styles.commentEmpty]}
          numberOfLines={3}
        >
          {hasComment ? photo.comment : 'Touche pour ajouter un commentaire'}
        </Text>
        <Text style={styles.hint}>Modifier</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.iconBtn, isCover && styles.iconBtnCover]}
          hitSlop={10}
          onPress={() => onSetCover(photo)}
        >
          <Text style={[styles.iconText, isCover && styles.coverText]}>
            {isCover ? '★' : '☆'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.iconBtn, photo.adjustments && styles.iconBtnActive]}
          hitSlop={10}
          onPress={() => onAdjust(photo)}
        >
          <Text style={styles.iconText}>🎚</Text>
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          hitSlop={10}
          onPress={() => onDelete(photo)}
        >
          <Text style={styles.deleteText}>✕</Text>
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
  body: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  comment: {
    fontSize: 15,
    color: '#1c1c1e',
    lineHeight: 20,
  },
  commentEmpty: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  hint: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 6,
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
  iconBtnActive: { backgroundColor: '#fef3c7' },
  iconBtnCover: { backgroundColor: '#fef3c7' },
  iconText: { fontSize: 13 },
  coverText: { color: '#f59e0b', fontSize: 15 },
  deleteText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '700',
  },
});

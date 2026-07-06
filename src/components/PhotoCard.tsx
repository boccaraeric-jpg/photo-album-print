import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Photo } from '../types';

interface Props {
  photo: Photo;
  /** Vrai si cette photo est la couverture (choisie ou par défaut). */
  isCover: boolean;
  onEdit: (photo: Photo) => void;
  onSetCover: (photo: Photo) => void;
  onAdjust: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
  /** Déplace la photo d'un cran vers le haut / le bas dans le dossier. */
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function PhotoCard({
  photo,
  isCover,
  onEdit,
  onSetCover,
  onAdjust,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: Props) {
  const hasComment = photo.comment.trim().length > 0;

  return (
    <Pressable style={styles.card} onPress={() => onEdit(photo)}>
      <View style={styles.reorder}>
        <Pressable
          style={styles.arrowBtn}
          hitSlop={8}
          onPress={onMoveUp}
          disabled={isFirst}
        >
          <Text style={[styles.arrow, isFirst && styles.arrowDisabled]}>▲</Text>
        </Pressable>
        <Pressable
          style={styles.arrowBtn}
          hitSlop={8}
          onPress={onMoveDown}
          disabled={isLast}
        >
          <Text style={[styles.arrow, isLast && styles.arrowDisabled]}>▼</Text>
        </Pressable>
      </View>
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
          <Ionicons
            name={isCover ? 'heart' : 'heart-outline'}
            size={20}
            color={isCover ? '#ef4444' : '#6b7280'}
          />
        </Pressable>
        <Pressable
          style={[styles.iconBtn, photo.adjustments && styles.iconBtnActive]}
          hitSlop={10}
          onPress={() => onAdjust(photo)}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={photo.adjustments ? '#b45309' : '#6b7280'}
          />
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          hitSlop={10}
          onPress={() => onDelete(photo)}
        >
          <Ionicons name="trash-outline" size={20} color="#6b7280" />
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
  reorder: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginRight: 8,
  },
  arrowBtn: {
    width: 30,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontSize: 13, color: '#374151', fontWeight: '700' },
  arrowDisabled: { color: '#d1d5db' },
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
  actions: { gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: '#fef3c7' },
  iconBtnCover: { backgroundColor: '#fee2e2' },
});

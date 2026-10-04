import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RichText } from './RichText';
import type { Photo } from '../types';
import { C, F } from '../theme';
import { useLang } from '../i18n';

interface Props {
  photo: Photo;
  /** Vrai si cette photo est la couverture (choisie ou par défaut). */
  isCover: boolean;
  onEdit: (photo: Photo) => void;
  /** Ouvre la photo en grand (visionneuse plein écran). */
  onView: (photo: Photo) => void;
  onSetCover: (photo: Photo) => void;
  onAdjust: (photo: Photo) => void;
  onCrop: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
  /** Déplace l'entrée d'un cran vers le haut / le bas dans le dossier. */
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function PhotoCard({
  photo,
  isCover,
  onEdit,
  onView,
  onSetCover,
  onAdjust,
  onCrop,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: Props) {
  const { L } = useLang();
  const isText = photo.kind === 'text';
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
      {isText ? (
        <View style={[styles.thumb, styles.textThumb]}>
          <Text style={styles.textThumbMark}>¶</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => onView(photo)}
          accessibilityRole="imagebutton"
          accessibilityLabel={L.viewer.open}
        >
          <Image source={{ uri: photo.uri }} style={styles.thumb} />
        </Pressable>
      )}
      <View style={styles.body}>
        {hasComment && !isText ? (
          // Le commentaire d'une photo peut porter du gras / du souligné : la
          // carte le montre tel qu'il sortira à l'export.
          <RichText
            text={photo.comment}
            style={styles.comment}
            boldStyle={styles.commentBold}
            numberOfLines={3}
          />
        ) : (
          <Text
            style={[styles.comment, !hasComment && styles.commentEmpty]}
            numberOfLines={3}
          >
            {hasComment
              ? photo.comment
              : isText
                ? L.photoCard.tapWriteText
                : L.photoCard.tapAddComment}
          </Text>
        )}
        <Text style={styles.hint}>
          {isText ? L.photoCard.textPage : L.photoCard.edit}
        </Text>
      </View>
      <View style={styles.actions}>
        {isText ? (
          <Pressable
            style={styles.iconBtn}
            hitSlop={10}
            onPress={() => onDelete(photo)}
          >
            <Ionicons name="trash-outline" size={20} color="#6b7280" />
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.iconBtn, isCover && styles.iconBtnCover]}
              hitSlop={10}
              onPress={() => onSetCover(photo)}
            >
              <Ionicons
                name={isCover ? 'star' : 'star-outline'}
                size={20}
                color={isCover ? '#A64B24' : '#6b7280'}
              />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              hitSlop={10}
              onPress={() => onCrop(photo)}
            >
              <Ionicons name="crop-outline" size={20} color="#6b7280" />
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
          </>
        )}
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
    backgroundColor: C.tan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontFamily: F.monoBold, fontSize: 13, color: C.inkSoft },
  arrowDisabled: { color: C.faint },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: 10,
    backgroundColor: C.tan,
  },
  textThumb: { alignItems: 'center', justifyContent: 'center' },
  textThumbMark: { fontFamily: F.display, fontSize: 34, color: C.sienna },
  body: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  comment: {
    fontSize: 15,
    color: C.ink,
    lineHeight: 20,
  },
  // Le style `comment` n'impose pas de famille : la police système comprend,
  // elle, les graisses — d'où `fontWeight` plutôt qu'une famille bold.
  commentBold: { fontWeight: '700' },
  commentEmpty: {
    color: C.muted,
    fontStyle: 'italic',
  },
  hint: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.sienna,
    letterSpacing: 1,
    marginTop: 7,
  },
  actions: { gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.tan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: '#F0D9A8' },
  iconBtnCover: { backgroundColor: '#EAC6B4' },
});

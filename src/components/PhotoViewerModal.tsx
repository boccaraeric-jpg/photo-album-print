import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Photo } from '../types';
import { F } from '../theme';
import { useLang } from '../i18n';
import { RichText } from './RichText';

interface Props {
  /** Photo à afficher en grand ; `null` ferme la visionneuse. */
  photo: Photo | null;
  onClose: () => void;
}

/**
 * Visionneuse plein écran : la vignette de `PhotoCard` fait 76 px, il fallait
 * pouvoir regarder une photo en grand une fois rangée dans le dossier.
 *
 * Le zoom repose sur les props natives de `ScrollView`
 * (`minimumZoomScale` / `maximumZoomScale`) : pincement fluide sans ajouter
 * `react-native-gesture-handler`. ⚠️ Ces props sont **iOS uniquement** ; sur
 * Android la photo reste affichée en plein écran, mais sans zoom.
 */
export function PhotoViewerModal({ photo, onClose }: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  // Les pages de texte n'ont pas d'image à agrandir.
  const visible = !!photo && photo.kind !== 'text' && !!photo.uri;
  const caption = photo?.comment.trim();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {visible && (
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={styles.content}
            maximumZoomScale={4}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={{ uri: photo!.uri }}
              style={{ width: W, height: H }}
              resizeMode="contain"
            />
          </ScrollView>
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button">
            <Text style={styles.topText}>{L.common.close}</Text>
          </Pressable>
          <Text style={styles.hint}>{L.viewer.hint}</Text>
        </View>

        {!!caption && (
          <View style={[styles.captionBar, { paddingBottom: insets.bottom + 16 }]}>
            <RichText text={caption} style={styles.caption} numberOfLines={4} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  content: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  topText: {
    fontFamily: F.monoBold,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.5,
  },
  hint: { fontFamily: F.mono, fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  captionBar: {
    marginTop: 'auto',
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  caption: {
    fontFamily: F.mono,
    fontSize: 14,
    lineHeight: 20,
    color: '#fff',
  },
});

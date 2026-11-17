import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
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
 * iOS : le zoom repose sur les props natives de `ScrollView`
 * (`minimumZoomScale` / `maximumZoomScale`), pincement fluide sans ajouter
 * `react-native-gesture-handler`. Ces props n'existent **pas sur Android** :
 * la photo s'y affichait sans pouvoir être agrandie (retour testeur). Android
 * passe donc par `ZoomablePhoto`, mêmes gestes en `PanResponder`.
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
        {visible && Platform.OS !== 'ios' && (
          <ZoomablePhoto uri={photo!.uri} width={W} height={H} />
        )}
        {visible && Platform.OS === 'ios' && (
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

/** Agrandissement maximal, comme le `maximumZoomScale` d'iOS. */
const MAX_ZOOM = 4;
/** Agrandissement d'un double appui. */
const TAP_ZOOM = 2.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const touchDist = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
};

/** Milieu des deux doigts, en coordonnées d'écran (la visionneuse est plein écran). */
const touchMid = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
};

type ZoomGesture =
  // `px`, `py` : point de la photo tenu entre les doigts, mesuré depuis son centre.
  | { mode: 'pinch'; s0: number; d0: number; px: number; py: number }
  | { mode: 'pan'; x0: number; y0: number; dx0: number; dy0: number };

/**
 * Photo agrandissable au doigt (Android) : pincer pour zoomer **sur le détail
 * tenu entre les doigts**, glisser pour se déplacer une fois agrandie, double
 * appui pour agrandir à l'endroit touché ou revenir. Gestes en
 * `PanResponder` (RN de base, comme `CropModal`), sans module natif.
 */
function ZoomablePhoto({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  // État courant, lu par les gestionnaires créés une seule fois.
  const cur = useRef({ s: 1, x: 0, y: 0 });
  const box = useRef({ w: width, h: height });
  box.current = { w: width, h: height };
  const gesture = useRef<ZoomGesture | null>(null);
  const tap = useRef({ downAt: 0, lastAt: 0 });

  /** Applique une position, bornée pour que la photo ne quitte pas l'écran. */
  const place = (s: number, x: number, y: number, animated = false) => {
    const maxX = (box.current.w * (s - 1)) / 2;
    const maxY = (box.current.h * (s - 1)) / 2;
    const next = { s, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
    cur.current = next;
    if (animated) {
      Animated.parallel(
        [
          Animated.timing(scale, { toValue: next.s, duration: 180, useNativeDriver: true }),
          Animated.timing(tx, { toValue: next.x, duration: 180, useNativeDriver: true }),
          Animated.timing(ty, { toValue: next.y, duration: 180, useNativeDriver: true }),
        ],
        { stopTogether: false },
      ).start();
    } else {
      scale.setValue(next.s);
      tx.setValue(next.x);
      ty.setValue(next.y);
    }
  };

  // Nouvelle photo : retour à la taille de l'écran.
  useEffect(() => {
    place(1, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const pan = useMemo(() => {
    // Point de la photo (depuis son centre, à l'échelle 1) sous un point d'écran.
    const photoPoint = (sx: number, sy: number) => ({
      x: (sx - box.current.w / 2 - cur.current.x) / cur.current.s,
      y: (sy - box.current.h / 2 - cur.current.y) / cur.current.s,
    });
    // Position qui amène ce point de la photo sous ce point d'écran.
    const placeUnder = (
      s: number,
      pt: { x: number; y: number },
      sx: number,
      sy: number,
      animated = false,
    ) => place(s, sx - box.current.w / 2 - s * pt.x, sy - box.current.h / 2 - s * pt.y, animated);
    const startPinch = (e: GestureResponderEvent) => {
      const mid = touchMid(e);
      const pt = photoPoint(mid.x, mid.y);
      gesture.current = {
        mode: 'pinch',
        s0: cur.current.s,
        d0: touchDist(e),
        px: pt.x,
        py: pt.y,
      };
    };
    const startPan = (gs: PanResponderGestureState) => {
      gesture.current = {
        mode: 'pan',
        x0: cur.current.x,
        y0: cur.current.y,
        dx0: gs.dx,
        dy0: gs.dy,
      };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e, gs) => {
        tap.current.downAt = Date.now();
        if (e.nativeEvent.touches.length >= 2) startPinch(e);
        else startPan(gs);
      },
      onPanResponderMove: (e, gs) => {
        const g = gesture.current;
        if (!g) return;
        if (e.nativeEvent.touches.length >= 2) {
          if (g.mode !== 'pinch') {
            startPinch(e);
            return;
          }
          const s = clamp((g.s0 * touchDist(e)) / g.d0, 1, MAX_ZOOM);
          // Le détail pincé reste sous les doigts : la photo grandit autour de
          // lui et suit le milieu des deux doigts s'ils se déplacent.
          const mid = touchMid(e);
          placeUnder(s, { x: g.px, y: g.py }, mid.x, mid.y);
          return;
        }
        if (g.mode === 'pinch') {
          // Un doigt levé : on continue en glissé, depuis la position atteinte.
          startPan(gs);
          return;
        }
        if (cur.current.s > 1) {
          place(cur.current.s, g.x0 + gs.dx - g.dx0, g.y0 + gs.dy - g.dy0);
        }
      },
      onPanResponderRelease: (e, gs) => {
        const wasPan = gesture.current?.mode === 'pan';
        gesture.current = null;
        const now = Date.now();
        const still = Math.abs(gs.dx) < 10 && Math.abs(gs.dy) < 10;
        if (wasPan && still && now - tap.current.downAt < 250) {
          if (now - tap.current.lastAt < 320) {
            // Double appui : agrandir, ou revenir à la taille de l'écran.
            tap.current.lastAt = 0;
            if (cur.current.s > 1.05) {
              place(1, 0, 0, true);
            } else {
              // Agrandit sur l'endroit touché, pas sur le centre de l'écran.
              const { pageX, pageY } = e.nativeEvent;
              placeUnder(TAP_ZOOM, photoPoint(pageX, pageY), pageX, pageY, true);
            }
            return;
          }
          tap.current.lastAt = now;
        }
        if (cur.current.s < 1.05) place(1, 0, 0, true);
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, styles.zoomBox]} {...pan.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={{
          width,
          height,
          transform: [{ translateX: tx }, { translateY: ty }, { scale }],
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  zoomBox: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
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

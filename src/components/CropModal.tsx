import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Modal,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import type { Photo } from '../types';
import { C, F } from '../theme';
import { useLang } from '../i18n';

interface Props {
  /** Photo à recadrer, ou null si fermé. */
  photo: Photo | null;
  /** Applique le recadrage : renvoie l'URI de l'image recadrée. */
  onSave: (id: string, uri: string) => void;
  onClose: () => void;
}

type Rect = { x: number; y: number; w: number; h: number };
type Size = { w: number; h: number };
/** Passage image → écran : `écran = image × s + o`. */
type Xf = { s: number; ox: number; oy: number };

/** Marge autour du cadre dans la scène : place des poignées, contexte assombri. */
const MARGIN = 28;
/** Zone de prise d'un coin / d'un bord, en points écran. */
const HIT_CORNER = 32;
const HIT_EDGE = 24;
/** Plus petit côté du cadre, en fraction du petit côté de l'image (zoom maxi ×15). */
const MIN_FRAC = 1 / 15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const minSide = (size: Size) => Math.max(32, Math.min(size.w, size.h) * MIN_FRAC);
const fullRect = (size: Size): Rect => ({ x: 0, y: 0, w: size.w, h: size.h });

/** Le cadre remplit la scène (moins la marge) : c'est l'image qui bouge dessous. */
function fitXf(c: Rect, stage: Size): Xf {
  const s = Math.min((stage.w - 2 * MARGIN) / c.w, (stage.h - 2 * MARGIN) / c.h);
  return {
    s,
    ox: stage.w / 2 - (c.x + c.w / 2) * s,
    oy: stage.h / 2 - (c.y + c.h / 2) * s,
  };
}

/** Garde le cadre dans l'image (taille inchangée). */
function clampPos(c: Rect, size: Size): Rect {
  return {
    ...c,
    x: clamp(c.x, 0, size.w - c.w),
    y: clamp(c.y, 0, size.h - c.h),
  };
}

/** Pincement : le cadre rétrécit (zoom avant) ou grandit autour de son centre. */
function zoomRect(base: Rect, k: number, size: Size): Rect {
  let w = base.w / k;
  let h = base.h / k;
  const down = Math.min(1, size.w / w, size.h / h);
  w *= down;
  h *= down;
  const m = minSide(size);
  const up = Math.max(1, m / w, m / h);
  w *= up;
  h *= up;
  const cx = base.x + base.w / 2;
  const cy = base.y + base.h / 2;
  return clampPos({ x: cx - w / 2, y: cy - h / 2, w, h }, size);
}

/**
 * Coin (`sx`, `sy` = ±1) ou bord (l'un des deux à 0) tiré de (`dx`, `dy`) pixels
 * image. Le côté opposé reste en place. Recadrage libre : aucun format imposé.
 */
function resizeRect(base: Rect, sx: number, sy: number, dx: number, dy: number, size: Size): Rect {
  const m = minSide(size);
  const right = base.x + base.w;
  const bottom = base.y + base.h;
  const w = sx ? clamp(base.w + sx * dx, m, sx < 0 ? right : size.w - base.x) : base.w;
  const h = sy ? clamp(base.h + sy * dy, m, sy < 0 ? bottom : size.h - base.y) : base.h;
  return {
    x: sx < 0 ? right - w : base.x,
    y: sy < 0 ? bottom - h : base.y,
    w,
    h,
  };
}

type Gesture =
  | { mode: 'move'; base: Rect; s: number; dx0: number; dy0: number }
  | { mode: 'resize'; base: Rect; s: number; sx: number; sy: number }
  | { mode: 'pinch'; base: Rect; dist0: number };

const touchDist = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
};

/**
 * Recadrage à la manière de l'app Photos de l'iPhone : on tire les coins ou les
 * bords du cadre, on glisse la photo dessous, on la pince pour zoomer ; pivot de
 * 90°. Recadrage libre seulement : les formats imposés ont été retirés (retour
 * testeurs, trop de choix).
 *
 * Gestes en `PanResponder` (RN de base, pas de gesture-handler, comme
 * `AnnotateModal`). Le cadre occupe toujours la scène : pendant un glissé ou un
 * pincement, c'est l'image qui bouge ; pendant qu'on tire une poignée, l'image
 * est figée (`frozen`) et le cadre se déforme, puis tout se recentre au lâcher.
 * Le rectangle vit en **pixels de l'image** (après pivot) : c'est lui que
 * `expo-image-manipulator` applique, en une seule passe sur l'original.
 */
export function CropModal({ photo, onSave, onClose }: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [rotation, setRotation] = useState(0); // degrés, sens horaire
  const [viewUri, setViewUri] = useState<string | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [stage, setStage] = useState<Size | null>(null);
  const [frozen, setFrozen] = useState<Xf | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);

  const size: Size | null = baseSize
    ? rotation % 180
      ? { w: baseSize.h, h: baseSize.w }
      : baseSize
    : null;

  useEffect(() => {
    setBaseSize(null);
    setRotation(0);
    setViewUri(photo?.uri ?? null);
    setCrop(null);
    setFrozen(null);
    setActive(false);
    if (photo) {
      Image.getSize(
        photo.uri,
        (w, h) => {
          setBaseSize({ w, h });
          setCrop({ x: 0, y: 0, w, h });
        },
        () => setBaseSize(null),
      );
    }
  }, [photo]);

  const xf: Xf | null =
    frozen ?? (crop && stage && stage.w > 2 * MARGIN && stage.h > 2 * MARGIN
      ? fitXf(crop, stage)
      : null);

  // Les gestionnaires du PanResponder sont créés une fois : ils lisent l'état
  // courant par cette référence.
  const live = useRef({ crop, xf, size });
  live.current = { crop, xf, size };
  const gesture = useRef<Gesture | null>(null);

  const pan = useMemo(() => {
    const startPinch = (e: GestureResponderEvent) => {
      const { crop: c } = live.current;
      if (!c) return;
      gesture.current = { mode: 'pinch', base: c, dist0: touchDist(e) };
      setFrozen(null);
    };

    const end = () => {
      if (gesture.current?.mode === 'resize') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      gesture.current = null;
      setFrozen(null);
      setActive(false);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { crop: c, xf: t } = live.current;
        if (!c || !t) return;
        setActive(true);
        if (e.nativeEvent.touches.length >= 2) {
          startPinch(e);
          return;
        }
        // Les enfants de la scène sont en `pointerEvents="none"` : locationX/Y
        // sont donc relatifs à la scène.
        const lx = e.nativeEvent.locationX;
        const ly = e.nativeEvent.locationY;
        const d = { x: t.ox + c.x * t.s, y: t.oy + c.y * t.s, w: c.w * t.s, h: c.h * t.s };
        let sx = 0;
        let sy = 0;
        for (const cx of [-1, 1]) {
          for (const cy of [-1, 1]) {
            const px = cx < 0 ? d.x : d.x + d.w;
            const py = cy < 0 ? d.y : d.y + d.h;
            if (!sx && Math.abs(lx - px) < HIT_CORNER && Math.abs(ly - py) < HIT_CORNER) {
              sx = cx;
              sy = cy;
            }
          }
        }
        if (!sx) {
          const inY = ly > d.y && ly < d.y + d.h;
          const inX = lx > d.x && lx < d.x + d.w;
          if (inY && Math.abs(lx - d.x) < HIT_EDGE) sx = -1;
          else if (inY && Math.abs(lx - d.x - d.w) < HIT_EDGE) sx = 1;
          else if (inX && Math.abs(ly - d.y) < HIT_EDGE) sy = -1;
          else if (inX && Math.abs(ly - d.y - d.h) < HIT_EDGE) sy = 1;
        }
        if (sx || sy) {
          gesture.current = { mode: 'resize', base: c, s: t.s, sx, sy };
          setFrozen(t);
        } else {
          gesture.current = { mode: 'move', base: c, s: t.s, dx0: 0, dy0: 0 };
        }
      },
      onPanResponderMove: (e: GestureResponderEvent, gs: PanResponderGestureState) => {
        const g = gesture.current;
        const { crop: c, xf: t, size: sz } = live.current;
        if (!g || !c || !t || !sz) return;
        if (e.nativeEvent.touches.length >= 2) {
          if (g.mode !== 'pinch') startPinch(e);
          else setCrop(zoomRect(g.base, touchDist(e) / g.dist0, sz));
          return;
        }
        if (g.mode === 'pinch') {
          // Un doigt levé : on continue en glissé, depuis la position atteinte.
          gesture.current = { mode: 'move', base: c, s: t.s, dx0: gs.dx, dy0: gs.dy };
          return;
        }
        if (g.mode === 'move') {
          const dx = (gs.dx - g.dx0) / g.s;
          const dy = (gs.dy - g.dy0) / g.s;
          setCrop(clampPos({ ...g.base, x: g.base.x - dx, y: g.base.y - dy }, sz));
          return;
        }
        setCrop(resizeRect(g.base, g.sx, g.sy, gs.dx / g.s, gs.dy / g.s, sz));
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, []);

  if (!photo) return null;

  const rotate = async () => {
    if (!baseSize || busy) return;
    const next = (rotation + 270) % 360; // quart de tour à gauche, comme Photos
    setBusy(true);
    try {
      // Image d'affichage seulement (réduite : rapide) ; le rendu final repart
      // de l'original avec la rotation et le cadre en une passe.
      const view =
        next === 0
          ? photo.uri
          : (
              await ImageManipulator.manipulateAsync(
                photo.uri,
                [{ rotate: next }, { resize: { width: 1400 } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
              )
            ).uri;
      const sz = next % 180 ? { w: baseSize.h, h: baseSize.w } : baseSize;
      setViewUri(view);
      setRotation(next);
      setCrop(fullRect(sz));
    } catch {
      Alert.alert(L.common.error, L.crop.failed);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (!baseSize) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRotation(0);
    setViewUri(photo.uri);
    setCrop(fullRect(baseSize));
  };

  const isFull =
    !!size &&
    !!crop &&
    crop.x < 1 &&
    crop.y < 1 &&
    crop.w > size.w - 1 &&
    crop.h > size.h - 1;
  const pristine = rotation === 0 && isFull;

  const apply = async () => {
    if (!size || !crop || applying || busy) return;
    if (pristine) {
      onSave(photo.id, photo.uri);
      return;
    }
    setApplying(true);
    try {
      const actions: ImageManipulator.Action[] = [];
      if (rotation) actions.push({ rotate: rotation });
      if (!isFull) {
        const originX = clamp(Math.round(crop.x), 0, size.w - 1);
        const originY = clamp(Math.round(crop.y), 0, size.h - 1);
        actions.push({
          crop: {
            originX,
            originY,
            width: Math.max(1, Math.min(Math.round(crop.w), size.w - originX)),
            height: Math.max(1, Math.min(Math.round(crop.h), size.h - originY)),
          },
        });
      }
      const res = await ImageManipulator.manipulateAsync(photo.uri, actions, {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onSave(photo.id, res.uri);
    } catch {
      Alert.alert(L.common.error, L.crop.failed);
    } finally {
      setApplying(false);
    }
  };

  // Cadre à l'écran.
  const d =
    xf && crop
      ? { x: xf.ox + crop.x * xf.s, y: xf.oy + crop.y * xf.s, w: crop.w * xf.s, h: crop.h * xf.s }
      : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <Text style={styles.title}>{L.crop.title}</Text>
          <Pressable
            onPress={reset}
            disabled={pristine || busy}
            hitSlop={10}
            style={styles.reset}
          >
            <Text style={[styles.resetText, (pristine || busy) && styles.dim]}>
              {L.crop.reset}
            </Text>
          </Pressable>
        </View>

        <View
          style={styles.stage}
          onLayout={(e) =>
            setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
          {...pan.panHandlers}
        >
          {xf && size && viewUri && d && stage && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image
                source={{ uri: viewUri }}
                style={{
                  position: 'absolute',
                  left: xf.ox,
                  top: xf.oy,
                  width: size.w * xf.s,
                  height: size.h * xf.s,
                }}
              />
              {/* Hors cadre : assombri. */}
              <View style={[styles.shade, { left: 0, top: 0, right: 0, height: Math.max(0, d.y) }]} />
              <View
                style={[styles.shade, { left: 0, right: 0, top: d.y + d.h, bottom: 0 }]}
              />
              <View style={[styles.shade, { left: 0, top: d.y, width: Math.max(0, d.x), height: d.h }]} />
              <View
                style={[styles.shade, { left: d.x + d.w, right: 0, top: d.y, height: d.h }]}
              />
              <View style={[styles.frame, { left: d.x, top: d.y, width: d.w, height: d.h }]}>
                {active &&
                  [1, 2].map((i) => (
                    <View key={`v${i}`} style={[styles.gridV, { left: `${(i * 100) / 3}%` }]} />
                  ))}
                {active &&
                  [1, 2].map((i) => (
                    <View key={`h${i}`} style={[styles.gridH, { top: `${(i * 100) / 3}%` }]} />
                  ))}
              </View>
              {/* Coins en équerre, comme Photos. */}
              {[-1, 1].flatMap((cx) =>
                [-1, 1].map((cy) => {
                  const px = cx < 0 ? d.x - 3 : d.x + d.w + 3;
                  const py = cy < 0 ? d.y - 3 : d.y + d.h + 3;
                  return (
                    <View key={`${cx}${cy}`}>
                      <View
                        style={[
                          styles.corner,
                          {
                            width: CORNER,
                            height: 3,
                            left: cx < 0 ? px : px - CORNER,
                            top: cy < 0 ? py : py - 3,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.corner,
                          {
                            width: 3,
                            height: CORNER,
                            left: cx < 0 ? px : px - 3,
                            top: cy < 0 ? py : py - CORNER,
                          },
                        ]}
                      />
                    </View>
                  );
                }),
              )}
            </View>
          )}
          {(!size || busy) && (
            <View pointerEvents="none" style={styles.loading}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        <Text style={styles.hint}>{L.crop.hint}</Text>

        <View style={styles.tools}>
          <Pressable
            style={styles.tool}
            onPress={rotate}
            disabled={busy || !size}
            accessibilityLabel={L.crop.rotate}
            hitSlop={6}
          >
            <MaterialIcons name="rotate-90-degrees-ccw" size={24} color="#fff" />
            <Text style={styles.toolText}>{L.crop.rotate}</Text>
          </Pressable>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={onClose}
            disabled={applying}
          >
            <Text style={styles.btnGhostText}>{L.common.cancel}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary, (applying || busy) && styles.dim]}
            onPress={apply}
            disabled={applying || busy || !size}
          >
            {applying ? (
              <ActivityIndicator color={C.paper} />
            ) : (
              <Text style={styles.btnPrimaryText}>{L.crop.apply}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CORNER = 22;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    height: 40,
  },
  title: { fontFamily: F.monoBold, fontSize: 17, color: '#fff' },
  reset: { position: 'absolute', right: 20 },
  resetText: { fontFamily: F.monoBold, fontSize: 14, color: C.tan },
  stage: { flex: 1, overflow: 'hidden' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  frame: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  corner: { position: 'absolute', backgroundColor: '#fff' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontFamily: F.mono,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  tools: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingTop: 14,
    paddingBottom: 8,
  },
  tool: { alignItems: 'center', gap: 4 },
  toolText: { fontFamily: F.mono, fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.14)' },
  btnGhostText: { fontFamily: F.monoBold, color: '#fff', fontSize: 16 },
  btnPrimary: { backgroundColor: C.sienna },
  btnPrimaryText: {
    fontFamily: F.monoBold,
    color: C.paper,
    fontSize: 15,
    letterSpacing: 1,
  },
  dim: { opacity: 0.4 },
});

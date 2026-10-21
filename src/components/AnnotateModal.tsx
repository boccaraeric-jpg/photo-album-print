import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  Path,
  useImage,
} from '@shopify/react-native-skia';
import type { Annotation, AnnotationWidth, Photo } from '../types';
import { buildColorMatrix, DEFAULT_ADJUSTMENTS } from '../adjustments';
import {
  ANNOTATION_COLORS,
  ANNOTATION_WIDTH_KEYS,
  ANNOTATION_WIDTHS,
  annotationPath,
  strokePx,
  type DrawRect,
} from '../annotations';
import { F } from '../theme';
import { useLang } from '../i18n';

interface Props {
  /** Photo à annoter (`null` = fermé). */
  photo: Photo | null;
  onSave: (photo: Photo, annotations: Annotation[]) => void;
  onClose: () => void;
}

type Tool = Annotation['kind'];

/**
 * Annotation au doigt (marqueur) : tracé libre ou flèche, quatre couleurs,
 * trois épaisseurs, annuler / tout effacer. La photo s'affiche comme dans
 * l'album (original + réglages + rotation) et les traits se posent par-dessus
 * en coordonnées normalisées ; `bakePhoto` les grave à l'enregistrement.
 *
 * Toucher : `PanResponder` de React Native (aucune dépendance de gestes).
 */
export function AnnotateModal({ photo, onSave, onClose }: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Annotation[]>([]);
  const [current, setCurrent] = useState<Annotation | null>(null);
  const [tool, setTool] = useState<Tool>('free');
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[1]);
  const [width, setWidth] = useState<AnnotationWidth>('medium');
  const [area, setArea] = useState({ width: 0, height: 0 });

  // Repart des annotations existantes à chaque ouverture.
  useEffect(() => {
    if (!photo) return;
    setItems(photo.annotations ?? []);
    setCurrent(null);
  }, [photo]);

  // Image de base : l'original, sur lequel réglages et rotation sont réappliqués.
  const image = useImage(photo ? (photo.originalUri ?? photo.uri) : null);
  const adj = photo?.adjustments ?? DEFAULT_ADJUSTMENTS;
  const rotation = ((adj.rotation % 360) + 360) % 360;

  // Rectangle de l'image (une fois pivotée) centré dans la zone de dessin.
  const rect: DrawRect | null = useMemo(() => {
    if (!image || !area.width || !area.height) return null;
    const swapped = rotation === 90 || rotation === 270;
    const w1 = swapped ? image.height() : image.width();
    const h1 = swapped ? image.width() : image.height();
    const scale = Math.min(area.width / w1, area.height / h1);
    const w = w1 * scale;
    const h = h1 * scale;
    return { x: (area.width - w) / 2, y: (area.height - h) / 2, w, h };
  }, [image, area, rotation]);

  // Les gestionnaires de toucher lisent l'état courant par référence : le
  // PanResponder est créé une fois.
  const live = useRef({ rect, tool, color, width });
  // Trait en cours : source de vérité des gestionnaires (l'état sert à l'affichage).
  const stroke = useRef<Annotation | null>(null);
  live.current = { rect, tool, color, width };
  const toPoint = (x: number, y: number): [number, number] | null => {
    const r = live.current.rect;
    if (!r) return null;
    return [
      Math.min(1, Math.max(0, (x - r.x) / r.w)),
      Math.min(1, Math.max(0, (y - r.y) / r.h)),
    ];
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const p = toPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (!p) return;
          const { tool: kind, color: c, width: w } = live.current;
          stroke.current = { kind, color: c, width: w, points: [p] };
          setCurrent(stroke.current);
        },
        onPanResponderMove: (e) => {
          const p = toPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
          const cur = stroke.current;
          if (!p || !cur) return;
          if (cur.kind === 'arrow') {
            stroke.current = { ...cur, points: [cur.points[0], p] };
          } else {
            // Points trop proches ignorés : tracé plus léger et plus lisse.
            const [lx, ly] = cur.points[cur.points.length - 1];
            if (Math.hypot(p[0] - lx, p[1] - ly) < 0.004) return;
            stroke.current = { ...cur, points: [...cur.points, p] };
          }
          setCurrent(stroke.current);
        },
        onPanResponderRelease: () => {
          const cur = stroke.current;
          stroke.current = null;
          setCurrent(null);
          // Une flèche sans longueur (simple toucher) n'est pas gardée.
          if (cur && !(cur.kind === 'arrow' && cur.points.length < 2)) {
            setItems((prev) => [...prev, cur]);
          }
        },
        onPanResponderTerminate: () => {
          stroke.current = null;
          setCurrent(null);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!photo) return null;
  const all = current ? [...items, current] : items;
  const swappedImg = rotation === 90 || rotation === 270;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.topBtn}>{L.common.cancel}</Text>
          </Pressable>
          <Text style={styles.topTitle}>{L.annotate.title}</Text>
          <Pressable
            onPress={() => onSave(photo, items)}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Text style={[styles.topBtn, styles.topBtnSave]}>{L.common.save}</Text>
          </Pressable>
        </View>

        <View
          style={styles.area}
          onLayout={(e) => setArea(e.nativeEvent.layout)}
          {...responder.panHandlers}
        >
          {image && rect ? (
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              <Group
                origin={{ x: area.width / 2, y: area.height / 2 }}
                transform={[{ rotate: (rotation * Math.PI) / 180 }]}
              >
                <SkiaImage
                  image={image}
                  x={(area.width - (swappedImg ? rect.h : rect.w)) / 2}
                  y={(area.height - (swappedImg ? rect.w : rect.h)) / 2}
                  width={swappedImg ? rect.h : rect.w}
                  height={swappedImg ? rect.w : rect.h}
                  fit="fill"
                >
                  <ColorMatrix matrix={buildColorMatrix(adj)} />
                </SkiaImage>
              </Group>
              {all.map((a, i) => (
                <Path
                  key={i}
                  path={annotationPath(a, rect)}
                  style="stroke"
                  strokeWidth={strokePx(a, rect)}
                  strokeCap="round"
                  strokeJoin="round"
                  color={a.color}
                />
              ))}
            </Canvas>
          ) : (
            <ActivityIndicator color="#9ca3af" />
          )}
        </View>

        <View style={[styles.tools, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.row}>
            {(['free', 'arrow'] as Tool[]).map((t) => (
              <Pressable
                key={t}
                style={[styles.toolBtn, tool === t && styles.toolBtnOn]}
                onPress={() => setTool(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: tool === t }}
              >
                <Ionicons
                  name={t === 'free' ? 'brush-outline' : 'arrow-forward-outline'}
                  size={18}
                  color={tool === t ? '#111114' : '#e5e7eb'}
                />
                <Text style={[styles.toolText, tool === t && styles.toolTextOn]}>
                  {t === 'free' ? L.annotate.free : L.annotate.arrow}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.row}>
            {ANNOTATION_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
                onPress={() => setColor(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: color === c }}
              />
            ))}
            <View style={styles.sep} />
            {ANNOTATION_WIDTH_KEYS.map((w) => (
              <Pressable
                key={w}
                style={[styles.widthBtn, width === w && styles.widthBtnOn]}
                onPress={() => setWidth(w)}
                accessibilityRole="button"
                accessibilityLabel={L.annotate.widths[w]}
                accessibilityState={{ selected: width === w }}
              >
                <View
                  style={{
                    width: 6 + ANNOTATION_WIDTHS[w] * 900,
                    height: 6 + ANNOTATION_WIDTHS[w] * 900,
                    borderRadius: 20,
                    backgroundColor: color,
                    borderWidth: color === '#111111' ? 1 : 0,
                    borderColor: '#6b7280',
                  }}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.row}>
            <Pressable
              style={[styles.actionBtn, !items.length && styles.disabled]}
              disabled={!items.length}
              onPress={() => setItems((prev) => prev.slice(0, -1))}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-undo-outline" size={18} color="#e5e7eb" />
              <Text style={styles.actionText}>{L.annotate.undo}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, !items.length && styles.disabled]}
              disabled={!items.length}
              onPress={() => setItems([])}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={18} color="#e5e7eb" />
              <Text style={styles.actionText}>{L.annotate.clear}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111114' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topBtn: { fontFamily: F.mono, color: '#d1d5db', fontSize: 16 },
  topBtnSave: { fontFamily: F.monoBold, color: '#fbbf24' },
  topTitle: { fontFamily: F.monoBold, color: '#fff', fontSize: 16 },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tools: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#26262c',
  },
  toolBtnOn: { backgroundColor: '#fbbf24' },
  toolText: { fontFamily: F.monoBold, fontSize: 14, color: '#e5e7eb' },
  toolTextOn: { color: '#111114' },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#3f3f46',
  },
  swatchOn: { borderWidth: 3, borderColor: '#fbbf24' },
  sep: { width: 1, height: 26, backgroundColor: '#3f3f46', marginHorizontal: 4 },
  widthBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#26262c',
  },
  widthBtnOn: { borderWidth: 2, borderColor: '#fbbf24' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#26262c',
  },
  actionText: { fontFamily: F.mono, fontSize: 14, color: '#e5e7eb' },
  disabled: { opacity: 0.4 },
});

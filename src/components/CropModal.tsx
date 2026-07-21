import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import type { Photo } from '../types';
import { C, F } from '../theme';

interface Props {
  /** Photo à recadrer, ou null si fermé. */
  photo: Photo | null;
  /** Applique le recadrage : renvoie l'URI de l'image recadrée. */
  onSave: (id: string, uri: string) => void;
  onClose: () => void;
}

const RATIOS: { value: string; label: string; r: number | null }[] = [
  { value: 'original', label: 'Original', r: null },
  { value: 'square', label: 'Carré', r: 1 },
  { value: 'landscape', label: '3:2', r: 3 / 2 },
  { value: 'portrait', label: '2:3', r: 2 / 3 },
  { value: 'wide', label: '16:9', r: 16 / 9 },
];

const BOX_W = 300;
const BOX_H = 340;

type Rect = { x: number; y: number; w: number; h: number };

/** Rectangle de recadrage (coords image) selon le format et la position choisis. */
function computeCrop(
  size: { w: number; h: number },
  r: number | null,
  ax: 'left' | 'center' | 'right',
  ay: 'top' | 'center' | 'bottom',
): Rect {
  if (r == null) return { x: 0, y: 0, w: size.w, h: size.h };
  let w: number;
  let h: number;
  if (size.w / size.h > r) {
    h = size.h;
    w = h * r;
  } else {
    w = size.w;
    h = w / r;
  }
  const x = ax === 'left' ? 0 : ax === 'right' ? size.w - w : (size.w - w) / 2;
  const y = ay === 'top' ? 0 : ay === 'bottom' ? size.h - h : (size.h - h) / 2;
  return { x, y, w, h };
}

/**
 * Recadrage par format + position (fiable, sans gestes). Aperçu avec un cadre
 * indiquant la zone gardée ; application via expo-image-manipulator.
 */
export function CropModal({ photo, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [ratioIdx, setRatioIdx] = useState(0);
  const [ax, setAx] = useState<'left' | 'center' | 'right'>('center');
  const [ay, setAy] = useState<'top' | 'center' | 'bottom'>('center');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setSize(null);
    setRatioIdx(0);
    setAx('center');
    setAy('center');
    if (photo) {
      Image.getSize(
        photo.uri,
        (w, h) => setSize({ w, h }),
        () => setSize(null),
      );
    }
  }, [photo]);

  if (!photo) return null;

  const r = RATIOS[ratioIdx].r;
  const scale = size ? Math.min(BOX_W / size.w, BOX_H / size.h) : 1;
  const dispW = size ? size.w * scale : 0;
  const dispH = size ? size.h * scale : 0;
  const dispX = (BOX_W - dispW) / 2;
  const dispY = (BOX_H - dispH) / 2;
  const c = size ? computeCrop(size, r, ax, ay) : null;

  const apply = async () => {
    if (!size || applying) return;
    if (r == null) {
      onSave(photo.id, photo.uri);
      return;
    }
    setApplying(true);
    try {
      const cr = computeCrop(size, r, ax, ay);
      const res = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          {
            crop: {
              originX: Math.round(cr.x),
              originY: Math.round(cr.y),
              width: Math.round(cr.w),
              height: Math.round(cr.h),
            },
          },
        ],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
      );
      onSave(photo.id, res.uri);
    } catch {
      Alert.alert('Erreur', 'Le recadrage a échoué.');
    } finally {
      setApplying(false);
    }
  };

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      style={[styles.chip, active && styles.chipOn]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Recadrer</Text>

        <View style={styles.box}>
          <Image
            source={{ uri: photo.uri }}
            style={{
              position: 'absolute',
              left: dispX,
              top: dispY,
              width: dispW,
              height: dispH,
            }}
          />
          {c && (
            <View
              style={[
                styles.frame,
                {
                  left: dispX + c.x * scale,
                  top: dispY + c.y * scale,
                  width: c.w * scale,
                  height: c.h * scale,
                },
              ]}
            />
          )}
        </View>

        <Text style={styles.label}>Format</Text>
        <View style={styles.row}>
          {RATIOS.map((ro, i) => chip(ro.label, ratioIdx === i, () => setRatioIdx(i)))}
        </View>

        {r != null && (
          <>
            <Text style={styles.label}>Position horizontale</Text>
            <View style={styles.row}>
              {chip('Gauche', ax === 'left', () => setAx('left'))}
              {chip('Centre', ax === 'center', () => setAx('center'))}
              {chip('Droite', ax === 'right', () => setAx('right'))}
            </View>
            <Text style={styles.label}>Position verticale</Text>
            <View style={styles.row}>
              {chip('Haut', ay === 'top', () => setAy('top'))}
              {chip('Centre', ay === 'center', () => setAy('center'))}
              {chip('Bas', ay === 'bottom', () => setAy('bottom'))}
            </View>
          </>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={onClose}
            disabled={applying}
          >
            <Text style={styles.btnGhostText}>Annuler</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary, applying && styles.disabled]}
            onPress={apply}
            disabled={applying || !size}
          >
            {applying ? (
              <ActivityIndicator color={C.paper} />
            ) : (
              <Text style={styles.btnPrimaryText}>Appliquer</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 20 },
  title: { fontFamily: F.display, fontSize: 30, color: C.ink, marginBottom: 14 },
  box: {
    width: BOX_W,
    height: BOX_H,
    alignSelf: 'center',
    backgroundColor: '#e9e0cd',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 18,
  },
  frame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: C.sienna,
  },
  label: {
    fontFamily: F.mono,
    fontSize: 11,
    letterSpacing: 1,
    color: C.muted,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.tan,
  },
  chipOn: { backgroundColor: C.sienna },
  chipText: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  chipTextOn: { color: C.paper },
  actions: { flexDirection: 'row', gap: 12, marginTop: 'auto', marginBottom: 24 },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: C.tan },
  btnGhostText: { fontFamily: F.monoBold, color: C.ink, fontSize: 16 },
  btnPrimary: { backgroundColor: C.ink },
  btnPrimaryText: {
    fontFamily: F.monoBold,
    color: C.paper,
    fontSize: 15,
    letterSpacing: 1,
  },
  disabled: { opacity: 0.5 },
});

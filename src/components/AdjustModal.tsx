import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import {
  Canvas,
  ColorMatrix,
  Group,
  Image as SkiaImage,
  useImage,
} from '@shopify/react-native-skia';

import type { Adjustments, Photo } from '../types';
import { buildColorMatrix, DEFAULT_ADJUSTMENTS } from '../adjustments';
import { F } from '../theme';

interface Props {
  /** Photo en cours de réglage, ou null si le modal est fermé. */
  photo: Photo | null;
  /** Applique et grave les réglages (asynchrone : encodage de l'image). */
  onSave: (photo: Photo, adjustments: Adjustments) => Promise<void>;
  onClose: () => void;
}

const SLIDERS: { key: keyof Omit<Adjustments, 'rotation'>; label: string }[] = [
  { key: 'exposure', label: 'Exposition' },
  { key: 'brightness', label: 'Luminosité' },
  { key: 'contrast', label: 'Contraste' },
  { key: 'saturation', label: 'Saturation' },
  { key: 'warmth', label: 'Chaleur' },
];

export function AdjustModal({ photo, onSave, onClose }: Props) {
  const [adj, setAdj] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [saving, setSaving] = useState(false);

  // Recharge les réglages existants à chaque ouverture.
  useEffect(() => {
    setAdj(photo?.adjustments ?? DEFAULT_ADJUSTMENTS);
    setSaving(false);
  }, [photo]);

  const save = async () => {
    if (!photo || saving) return;
    setSaving(true);
    try {
      await onSave(photo, adj);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={photo !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable hitSlop={10} onPress={onClose} disabled={saving}>
            <Text style={styles.topBtn}>Annuler</Text>
          </Pressable>
          <Text style={styles.topTitle}>Réglages</Text>
          <Pressable hitSlop={10} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fbbf24" />
            ) : (
              <Text style={[styles.topBtn, styles.topBtnSave]}>OK</Text>
            )}
          </Pressable>
        </View>

        {photo && <Preview photo={photo} adjustments={adj} />}

        <View style={styles.controls}>
          <View style={styles.rotateRow}>
            <Pressable
              style={styles.rotateBtn}
              onPress={() =>
                setAdj((a) => ({ ...a, rotation: (a.rotation + 90) % 360 }))
              }
            >
              <Text style={styles.rotateText}>⟳  Pivoter 90°</Text>
            </Pressable>
            <Pressable
              style={styles.rotateBtn}
              onPress={() => setAdj(DEFAULT_ADJUSTMENTS)}
            >
              <Text style={styles.rotateText}>Réinitialiser</Text>
            </Pressable>
          </View>

          <ScrollView bounces={false}>
            {SLIDERS.map(({ key, label }) => (
              <View key={key} style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                  <Text style={styles.sliderLabel}>{label}</Text>
                  <Text style={styles.sliderValue}>
                    {adj[key] > 0 ? `+${adj[key]}` : adj[key]}
                  </Text>
                </View>
                <Slider
                  minimumValue={-100}
                  maximumValue={100}
                  step={1}
                  value={adj[key]}
                  onValueChange={(v) => setAdj((a) => ({ ...a, [key]: v }))}
                  minimumTrackTintColor="#fbbf24"
                  maximumTrackTintColor="#4b5563"
                  thumbTintColor="#ffffff"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Preview({
  photo,
  adjustments,
}: {
  photo: Photo;
  adjustments: Adjustments;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Aperçu basé sur l'image d'origine : les réglages sont réappliqués dessus.
  const image = useImage(photo.originalUri ?? photo.uri);

  let content = null;
  if (image && size.width > 0 && size.height > 0) {
    const iw = image.width();
    const ih = image.height();
    const rotation = ((adjustments.rotation % 360) + 360) % 360;
    const swapped = rotation === 90 || rotation === 270;
    // Échelle pour que l'image (une fois pivotée) tienne dans le canvas.
    const scale = Math.min(
      size.width / (swapped ? ih : iw),
      size.height / (swapped ? iw : ih),
    );
    const dw = iw * scale;
    const dh = ih * scale;
    content = (
      <Canvas style={{ width: size.width, height: size.height }}>
        <Group
          origin={{ x: size.width / 2, y: size.height / 2 }}
          transform={[{ rotate: (rotation * Math.PI) / 180 }]}
        >
          <SkiaImage
            image={image}
            x={(size.width - dw) / 2}
            y={(size.height - dh) / 2}
            width={dw}
            height={dh}
            fit="fill"
          >
            <ColorMatrix matrix={buildColorMatrix(adjustments)} />
          </SkiaImage>
        </Group>
      </Canvas>
    );
  }

  return (
    <View
      style={styles.preview}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {content ?? <ActivityIndicator color="#9ca3af" />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111114' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  topBtn: { fontFamily: F.mono, color: '#d1d5db', fontSize: 16 },
  topBtnSave: { fontFamily: F.monoBold, color: '#fbbf24' },
  topTitle: { fontFamily: F.monoBold, color: '#fff', fontSize: 16 },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  controls: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: 320,
  },
  rotateRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  rotateBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#26262b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateText: { fontFamily: F.monoBold, color: '#e5e7eb', fontSize: 14 },
  sliderRow: { marginTop: 6 },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -2,
  },
  sliderLabel: { fontFamily: F.mono, color: '#9ca3af', fontSize: 13 },
  sliderValue: { fontFamily: F.monoBold, color: '#fbbf24', fontSize: 13 },
});

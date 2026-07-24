import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { F } from '../theme';
import { useLang } from '../i18n';
import type { DateFormat, ExportOptions, FrameStyle, PhotoSize } from '../types';

interface Props {
  visible: boolean;
  /** Options pré-sélectionnées (dernier export). */
  initial: ExportOptions;
  /** Vrai pendant la préparation de l'aperçu (lecture des images). */
  preparing: boolean;
  /** Ouvre l'aperçu avant envoi avec les options choisies. */
  onPreview: (options: ExportOptions) => void;
  onClose: () => void;
}

// Ordres d'affichage (les libellés viennent du dictionnaire, cf. `L.export.*`).
const SIZE_KEYS: PhotoSize[] = ['small', 'medium', 'large', 'full'];
const FRAME_KEYS: FrameStyle[] = ['card', 'border', 'polaroid', 'none'];
const ALIGN_KEYS: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
const DATE_FORMAT_KEYS: DateFormat[] = ['short', 'shortTime', 'long', 'full', 'none'];

const BACKGROUNDS = [
  '#f6f1e9', // crème
  '#ffffff', // blanc
  '#dfe3e8', // gris clair
  '#f6ddd0', // rose poudré
  '#fbf3c4', // jaune clair
  '#dcf3e0', // vert clair
  '#f9dada', // rouge clair
  '#dbeafe', // bleu clair
  '#22211f', // sombre
];

/** Options de personnalisation du mini album, affichées avant l'export. */
export function ExportModal({
  visible,
  initial,
  preparing,
  onPreview,
  onClose,
}: Props) {
  const { L } = useLang();
  const [options, setOptions] = useState<ExportOptions>(initial);

  // Repart des dernières options à chaque ouverture.
  useEffect(() => {
    if (visible) setOptions(initial);
  }, [visible, initial]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{L.export.title}</Text>

          {options.style === 'pro' ? (
            <Text style={styles.proNote}>{L.export.proNote}</Text>
          ) : (
            <>
          <Text style={styles.label}>{L.export.sizeLabel}</Text>
          <View style={styles.chips}>
            {SIZE_KEYS.map((value) => {
              const selected = options.photoSize === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setOptions((o) => ({ ...o, photoSize: value }))}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {L.export.sizes[value]}
                  </Text>
                  <Text
                    style={[styles.chipHint, selected && styles.chipHintSelected]}
                  >
                    {L.export.sizeHints[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{L.export.bgLabel}</Text>
          <View style={styles.chips}>
            {BACKGROUNDS.map((color) => {
              const selected = options.background === color;
              return (
                <Pressable
                  key={color}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    selected && styles.swatchSelected,
                  ]}
                  onPress={() => setOptions((o) => ({ ...o, background: color }))}
                />
              );
            })}
          </View>

          <Text style={styles.label}>{L.export.frameLabel}</Text>
          <View style={styles.chips}>
            {FRAME_KEYS.map((value) => {
              const selected = options.frame === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setOptions((o) => ({ ...o, frame: value }))}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {L.export.frames[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{L.export.liseretLabel}</Text>
          <View style={styles.chips}>
            {([true, false] as const).map((value) => {
              const selected = options.liseret === value;
              return (
                <Pressable
                  key={String(value)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setOptions((o) => ({ ...o, liseret: value }))}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {value ? L.export.yes : L.export.no}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{L.export.dateLabel}</Text>
          <View style={styles.chips}>
            {DATE_FORMAT_KEYS.map((value) => {
              const selected = options.dateFormat === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setOptions((o) => ({ ...o, dateFormat: value }))}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {L.export.dateFormats[value]}
                  </Text>
                  <Text
                    style={[styles.chipHint, selected && styles.chipHintSelected]}
                  >
                    {L.export.dateHints[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {options.dateFormat !== 'none' && (
            <>
              <Text style={styles.label}>{L.export.datePosLabel}</Text>
              <View style={styles.chips}>
                {ALIGN_KEYS.map((value) => {
                  const selected = options.dateAlign === value;
                  return (
                    <Pressable
                      key={value}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() =>
                        setOptions((o) => ({ ...o, dateAlign: value }))
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {L.export.aligns[value]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
            </>
          )}

          <Text style={styles.label}>{L.export.textAlignLabel}</Text>
          <View style={styles.chips}>
            {ALIGN_KEYS.map((value) => {
              const selected = options.textAlign === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setOptions((o) => ({ ...o, textAlign: value }))}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {L.export.aligns[value]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              disabled={preparing}
            >
              <Text style={styles.btnGhostText}>{L.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, preparing && styles.btnDisabled]}
              disabled={preparing}
              onPress={() => onPreview(options)}
            >
              {preparing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{L.export.previewBtn} →</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    marginBottom: 16,
  },
  title: {
    fontFamily: F.display,
    fontSize: 17,
    color: '#201B14',
    marginBottom: 4,
  },
  label: {
    fontFamily: F.monoBold,
    fontSize: 13,
    color: '#A64B24',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: '#A64B24' },
  chipText: { fontFamily: F.monoBold, fontSize: 14, color: '#374151' },
  chipTextSelected: { color: '#fff' },
  chipHint: { fontFamily: F.mono, fontSize: 11, color: '#9ca3af', marginTop: 1 },
  chipHintSelected: { color: 'rgba(255,255,255,0.75)' },
  proNote: {
    fontFamily: F.mono,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
    marginTop: 14,
    marginBottom: 4,
  },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: '#A64B24',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#f3f4f6' },
  btnGhostText: { fontFamily: F.monoBold, color: '#374151', fontSize: 16 },
  btnPrimary: { backgroundColor: '#A64B24' },
  btnPrimaryText: { fontFamily: F.monoBold, color: '#fff', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
});

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

const SIZES: { value: PhotoSize; label: string; hint: string }[] = [
  { value: 'small', label: 'Petite', hint: '4 / page' },
  { value: 'medium', label: 'Moyenne', hint: '2 / page' },
  { value: 'large', label: 'Grande', hint: '1 / page' },
  { value: 'full', label: 'Pleine page', hint: 'bord à bord' },
];

const FRAMES: { value: FrameStyle; label: string }[] = [
  { value: 'card', label: 'Carte' },
  { value: 'border', label: 'Bordure' },
  { value: 'polaroid', label: 'Polaroïd' },
  { value: 'none', label: 'Sans cadre' },
];

const DATE_FORMATS: { value: DateFormat; label: string; hint: string }[] = [
  { value: 'short', label: 'Simple', hint: '08/07/2026' },
  { value: 'long', label: 'Détaillée', hint: 'mercredi 8 juillet 2026' },
  { value: 'full', label: 'Complète', hint: '… à 19h37' },
  { value: 'none', label: 'Aucune', hint: 'sans date' },
];

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
          <Text style={styles.title}>Mise en page</Text>

          {options.style === 'pro' ? (
            <Text style={styles.proNote}>
              Mise en page sobre imposée : fond blanc, photos numérotées, avec
              date/heure, lieu et description sous chacune.
            </Text>
          ) : (
            <>
          <Text style={styles.label}>Taille des photos</Text>
          <View style={styles.chips}>
            {SIZES.map(({ value, label, hint }) => {
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
                    {label}
                  </Text>
                  <Text
                    style={[styles.chipHint, selected && styles.chipHintSelected]}
                  >
                    {hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Couleur du fond</Text>
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

          <Text style={styles.label}>Encadré</Text>
          <View style={styles.chips}>
            {FRAMES.map(({ value, label }) => {
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
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Liseré autour de la photo</Text>
          <View style={styles.chips}>
            {[
              { value: true, label: 'Oui' },
              { value: false, label: 'Non' },
            ].map(({ value, label }) => {
              const selected = options.liseret === value;
              return (
                <Pressable
                  key={label}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setOptions((o) => ({ ...o, liseret: value }))}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextSelected]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Date sous les photos</Text>
          <View style={styles.chips}>
            {DATE_FORMATS.map(({ value, label, hint }) => {
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
                    {label}
                  </Text>
                  <Text
                    style={[styles.chipHint, selected && styles.chipHintSelected]}
                  >
                    {hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>
            </>
          )}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              disabled={preparing}
            >
              <Text style={styles.btnGhostText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, preparing && styles.btnDisabled]}
              disabled={preparing}
              onPress={() => onPreview(options)}
            >
              {preparing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Aperçu →</Text>
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
    fontSize: 17,
    fontWeight: '700',
    color: '#201B14',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
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
  chipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  chipTextSelected: { color: '#fff' },
  chipHint: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  chipHintSelected: { color: 'rgba(255,255,255,0.75)' },
  proNote: {
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
  btnGhostText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#A64B24' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
});

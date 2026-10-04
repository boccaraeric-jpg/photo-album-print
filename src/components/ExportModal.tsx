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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
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
// Le polaroïd (cadre blanc façon scrapbook) reste réservé au familial : il n'a
// pas sa place dans un rapport d'expertise.
const PRO_FRAME_KEYS: FrameStyle[] = FRAME_KEYS.filter((f) => f !== 'polaroid');
const ALIGN_KEYS: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
// Position verticale du commentaire : familial seulement. Le gabarit pro dispose
// sa fiche en flux (la description ne doit jamais être tronquée), il n'a pas de
// bande de commentaire où placer quoi que ce soit.
const COMMENT_POS_KEYS: ('top' | 'middle' | 'bottom')[] = ['top', 'middle', 'bottom'];
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

/** Puce de choix (libellé + précision facultative). */
function Chip({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
      {!!hint && (
        <Text style={[styles.chipHint, selected && styles.chipHintSelected]}>
          {hint}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Options de personnalisation du mini album, affichées avant l'export.
 *
 * Écran **plein écran**, comme `CropModal` / `PreviewModal` : en-tête et barre
 * d'action fixes, seul le corps défile. L'ancienne carte posée sur un fond
 * assombri imitait une feuille système sans en avoir les comportements
 * (glisser pour fermer, safe area).
 */
export function ExportModal({
  visible,
  initial,
  preparing,
  onPreview,
  onClose,
}: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<ExportOptions>(initial);
  const isPro = options.style === 'pro';
  // En pro les sections sont peu nombreuses : on les aère davantage.
  const labelStyle = isPro ? [styles.label, styles.labelSpaced] : styles.label;

  // Repart des dernières options à chaque ouverture. En pro, un encadrement
  // « Polaroïd » hérité d'un export familial n'est plus proposé : on le ramène
  // sur « Bordure », sinon aucune puce ne serait sélectionnée.
  useEffect(() => {
    if (!visible) return;
    setOptions(
      initial.style === 'pro' && initial.frame === 'polaroid'
        ? { ...initial, frame: 'border' }
        : initial,
    );
  }, [visible, initial]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            disabled={preparing}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={L.common.cancel}
          >
            <Text style={[styles.close, preparing && styles.disabled]}>✕</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {L.export.title}
          </Text>
          <Text style={styles.badge}>
            {isPro ? L.albumScreen.professional : L.albumScreen.private}
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          {/* Taille, fond et liseré n'existent qu'en familial : le gabarit pro
              impose une photo pleine largeur sur fond blanc. */}
          {!isPro && (
            <>
              <Text style={styles.label}>{L.export.sizeLabel}</Text>
              <View style={styles.chips}>
                {SIZE_KEYS.map((value) => (
                  <Chip
                    key={value}
                    selected={options.photoSize === value}
                    label={L.export.sizes[value]}
                    hint={L.export.sizeHints[value]}
                    onPress={() => setOptions((o) => ({ ...o, photoSize: value }))}
                  />
                ))}
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
            </>
          )}

          <Text style={labelStyle}>{L.export.frameLabel}</Text>
          <View style={styles.chips}>
            {(isPro ? PRO_FRAME_KEYS : FRAME_KEYS).map((value) => (
              <Chip
                key={value}
                selected={options.frame === value}
                label={L.export.frames[value]}
                onPress={() => setOptions((o) => ({ ...o, frame: value }))}
              />
            ))}
          </View>

          {!isPro && (
            <>
              <Text style={styles.label}>{L.export.liseretLabel}</Text>
              <View style={styles.chips}>
                {([true, false] as const).map((value) => (
                  <Chip
                    key={String(value)}
                    selected={options.liseret === value}
                    label={value ? L.export.yes : L.export.no}
                    onPress={() => setOptions((o) => ({ ...o, liseret: value }))}
                  />
                ))}
              </View>
            </>
          )}

          <Text style={labelStyle}>{L.export.placeLabel}</Text>
          <View style={styles.chips}>
            {([true, false] as const).map((value) => (
              <Chip
                key={String(value)}
                selected={options.showPlace === value}
                label={value ? L.export.yes : L.export.no}
                onPress={() => setOptions((o) => ({ ...o, showPlace: value }))}
              />
            ))}
          </View>

          <Text style={labelStyle}>{L.export.dateLabel}</Text>
          <View style={styles.chips}>
            {DATE_FORMAT_KEYS.map((value) => (
              <Chip
                key={value}
                selected={options.dateFormat === value}
                label={L.export.dateFormats[value]}
                hint={L.export.dateHints[value]}
                onPress={() => setOptions((o) => ({ ...o, dateFormat: value }))}
              />
            ))}
          </View>

          {options.dateFormat !== 'none' && (
            <>
              <Text style={labelStyle}>{L.export.datePosLabel}</Text>
              <View style={styles.chips}>
                {ALIGN_KEYS.map((value) => (
                  <Chip
                    key={value}
                    selected={options.dateAlign === value}
                    label={L.export.aligns[value]}
                    onPress={() => setOptions((o) => ({ ...o, dateAlign: value }))}
                  />
                ))}
              </View>
            </>
          )}

          {!isPro && (
            <>
              <Text style={styles.label}>{L.export.commentPosLabel}</Text>
              <View style={styles.chips}>
                {COMMENT_POS_KEYS.map((value) => (
                  <Chip
                    key={value}
                    selected={options.commentVAlign === value}
                    label={L.export.commentPos[value]}
                    onPress={() =>
                      setOptions((o) => ({ ...o, commentVAlign: value }))
                    }
                  />
                ))}
              </View>
            </>
          )}

          <Text style={labelStyle}>{L.export.textAlignLabel}</Text>
          <View style={styles.chips}>
            {ALIGN_KEYS.map((value) => (
              <Chip
                key={value}
                selected={options.textAlign === value}
                label={L.export.aligns[value]}
                onPress={() => setOptions((o) => ({ ...o, textAlign: value }))}
              />
            ))}
          </View>
        </ScrollView>

        <View
          style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}
        >
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={onClose}
            disabled={preparing}
          >
            <Text style={styles.btnGhostText}>{L.common.cancel}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary, preparing && styles.disabled]}
            disabled={preparing}
            onPress={() => onPreview(options)}
          >
            {preparing ? (
              <ActivityIndicator color={C.paper} />
            ) : (
              <Text style={styles.btnPrimaryText}>{L.export.previewBtn} →</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  close: { fontFamily: F.mono, fontSize: 20, color: C.ink },
  title: { flex: 1, fontFamily: F.display, fontSize: 22, color: C.ink },
  badge: {
    fontFamily: F.monoBold,
    fontSize: 11,
    letterSpacing: 1,
    color: C.sienna,
    textTransform: 'uppercase',
  },
  // Seul le corps défile ; en-tête et barre d'action restent visibles.
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  label: {
    // Gras + corps 13 (≈ +18 % sur l'ancien 11) : les intitulés de section
    // devaient ressortir du reste. `fontWeight` serait ignoré sur iOS avec une
    // famille custom — c'est la clé `F` qui porte la graisse.
    fontFamily: F.monoBold,
    fontSize: 13,
    letterSpacing: 1,
    // `C.ink` (encre quasi noire), pas `C.inkSoft` (brun) : les intitulés
    // doivent trancher franchement sur le fond crème.
    color: C.ink,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  labelSpaced: { marginTop: 34 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.tan,
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: C.sienna },
  chipText: { fontFamily: F.monoBold, fontSize: 14, color: C.ink },
  chipTextSelected: { color: C.paper },
  chipHint: { fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 1 },
  chipHintSelected: { color: 'rgba(241,233,214,0.8)' },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.line,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: C.sienna,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.card,
  },
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

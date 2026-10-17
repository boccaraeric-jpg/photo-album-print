import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { effectiveCover, SCATTER_MAX, SCATTER_MIN, validScatterPicks } from '../albumStyle';
import { collectPlaces } from '../albumMap';
import type {
  CoverStyle,
  DateFormat,
  ExportOptions,
  FrameStyle,
  Photo,
  PhotoSize,
  Typeface,
} from '../types';

interface Props {
  visible: boolean;
  /** Options pré-sélectionnées (dernier export). */
  initial: ExportOptions;
  /** Entrées du dossier, dans l'ordre : nombre minimal d'un montage et choix du pêle-mêle. */
  photos: Photo[];
  /** Photos déjà choisies pour le pêle-mêle (absent = automatique). */
  scatterIds?: string[];
  /** Vrai pendant la préparation de l'aperçu (lecture des images). */
  preparing: boolean;
  /** Ouvre l'aperçu avant envoi avec les options et la sélection du pêle-mêle (`[]` = automatique). */
  onPreview: (options: ExportOptions, scatterIds: string[]) => void;
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
const TYPEFACE_KEYS: Typeface[] = ['sans', 'serif', 'script'];
const COVER_KEYS: CoverStyle[] = ['classic', 'scatter', 'filmstrip'];
// Chaque choix de typographie s'écrit dans sa propre police : un nom de police
// ne dit rien à un utilisateur, un échantillon si.
const TYPEFACE_FONTS: Record<Typeface, string> = {
  sans: F.display,
  serif: F.serifBold,
  script: F.scriptBold,
};

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

/** Carte de choix illustrée (échantillon de police ou schéma de couverture). */
function Tile({
  label,
  hint,
  selected,
  onPress,
  children,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      style={[styles.tile, selected && styles.tileSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      {children}
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>{label}</Text>
      {!!hint && <Text style={styles.tileHint}>{hint}</Text>}
    </Pressable>
  );
}

/** Schéma miniature d'une page de couverture (pas de photo réelle : lisible d'un coup d'œil). */
function CoverSketch({ kind }: { kind: CoverStyle }) {
  if (kind === 'classic') {
    return (
      <View style={styles.sketch}>
        <View style={[styles.sketchLine, { width: 30, marginTop: 6 }]} />
        <View style={[styles.sketchPhoto, { width: 38, height: 40, marginTop: 6 }]} />
      </View>
    );
  }
  if (kind === 'scatter') {
    const polas: [number, number, string][] = [
      [5, 16, '-9deg'],
      [26, 14, '8deg'],
      [7, 42, '7deg'],
      [27, 44, '-6deg'],
      [16, 28, '-2deg'],
    ];
    return (
      <View style={styles.sketch}>
        <View style={[styles.sketchLine, { width: 26, marginTop: 5 }]} />
        {polas.map(([left, top, rotate], i) => (
          <View key={i} style={[styles.sketchPola, { left, top, transform: [{ rotate }] }]} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.sketch}>
      <View style={styles.sketchGrid}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={styles.sketchCell} />
        ))}
      </View>
      <View style={[styles.sketchLine, { width: 26, marginTop: 6 }]} />
    </View>
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
  photos,
  scatterIds,
  preparing,
  onPreview,
  onClose,
}: Props) {
  const { L, lang } = useLang();
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<ExportOptions>(initial);
  const images = photos.filter((p) => p.kind !== 'text');
  const photoCount = images.length;
  // Sélection du pêle-mêle validée, et brouillon pendant le choix. Le
  // brouillon ne remplace la sélection qu'à « Valider » : fermer le panneau
  // ne perd rien.
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const toggleDraft = (id: string) =>
    setDraft((d) => {
      const cur = d ?? [];
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      return cur.length >= SCATTER_MAX ? cur : [...cur, id];
    });
  const isPro = options.style === 'pro';
  // Lieux plaçables sur la carte (photos géolocalisées) : 0 → réglage inactif.
  const placeCount = useMemo(() => collectPlaces(photos, lang).length, [photos, lang]);
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
    // Une photo supprimée depuis le dernier choix sort de la sélection.
    setPicked(validScatterPicks(photos, scatterIds).map((p) => p.id));
    setDraft(null);
    // `photos` change à chaque édition du dossier : la sélection n'est relue
    // qu'à l'ouverture, pas pendant le réglage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {/* Typographie et couverture : familial seulement (le pro garde sa
              page de garde factuelle en Montserrat). En tête de l'écran : ce
              sont les deux choix qui changent le plus l'allure de l'album. */}
          {!isPro && (
            <>
              <Text style={styles.label}>{L.export.typefaceLabel}</Text>
              <View style={styles.tiles}>
                {TYPEFACE_KEYS.map((value) => (
                  <Tile
                    key={value}
                    label={L.export.typefaces[value]}
                    selected={options.typeface === value}
                    onPress={() => setOptions((o) => ({ ...o, typeface: value }))}
                  >
                    <Text
                      style={[styles.sample, { fontFamily: TYPEFACE_FONTS[value] }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {L.export.typefaceSample}
                    </Text>
                  </Tile>
                ))}
              </View>

              <Text style={styles.label}>{L.export.coverLabel}</Text>
              <View style={styles.tiles}>
                {COVER_KEYS.map((value) => (
                  <Tile
                    key={value}
                    label={L.export.covers[value]}
                    hint={L.export.coverHints[value]}
                    selected={options.cover === value}
                    onPress={() => setOptions((o) => ({ ...o, cover: value }))}
                  >
                    <CoverSketch kind={value} />
                  </Tile>
                ))}
              </View>
              {effectiveCover(options.cover, photoCount) !== options.cover && (
                <Text style={styles.note}>{L.export.coverFallback(photoCount)}</Text>
              )}
              {options.cover === 'scatter' && photoCount >= SCATTER_MIN && (
                <View style={styles.pickRow}>
                  <View style={styles.pickInfo}>
                    <Text style={styles.pickTitle}>{L.export.scatterPhotosLabel}</Text>
                    <Text style={styles.note}>
                      {picked.length
                        ? L.export.scatterChosen(picked.length)
                        : L.export.scatterAuto}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.pickBtn}
                    onPress={() => setDraft(picked)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.pickBtnText}>{L.export.scatterChoose}</Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.label}>{L.export.mapLabel}</Text>
              {placeCount > 0 ? (
                <>
                  <View style={styles.chips}>
                    {([true, false] as const).map((value) => (
                      <Chip
                        key={String(value)}
                        selected={options.showMap === value}
                        label={value ? L.export.yes : L.export.no}
                        onPress={() => setOptions((o) => ({ ...o, showMap: value }))}
                      />
                    ))}
                  </View>
                  <Text style={styles.note}>{L.export.mapHint(placeCount)}</Text>
                </>
              ) : (
                <Text style={styles.note}>{L.export.mapNone}</Text>
              )}
            </>
          )}

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
            onPress={() => onPreview(options, picked)}
          >
            {preparing ? (
              <ActivityIndicator color={C.paper} />
            ) : (
              <Text style={styles.btnPrimaryText}>{L.export.previewBtn} →</Text>
            )}
          </Pressable>
        </View>

        {/* Choix des photos du pêle-mêle : surcouche <View> et non <Modal>,
            iOS ne présente pas deux Modal imbriqués (cf. SpellCheckModal). */}
        {draft && (
          <View
            style={[
              styles.picker,
              { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.header}>
              <Pressable
                onPress={() => setDraft(null)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={L.common.cancel}
              >
                <Text style={styles.close}>✕</Text>
              </Pressable>
              <Text style={styles.title} numberOfLines={1}>
                {L.export.scatterPhotosLabel}
              </Text>
              <Text style={styles.badge}>{L.export.scatterCount(draft.length)}</Text>
            </View>
            <Text style={[styles.note, styles.pickHint]}>{L.export.scatterPickHint}</Text>
            <FlatList
              data={images}
              keyExtractor={(p) => p.id}
              numColumns={3}
              contentContainerStyle={styles.pickGrid}
              columnWrapperStyle={styles.pickGridRow}
              renderItem={({ item }) => {
                const rank = draft.indexOf(item.id);
                return (
                  <Pressable
                    style={[styles.thumb, rank >= 0 && styles.thumbSelected]}
                    onPress={() => toggleDraft(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: rank >= 0 }}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbImg} />
                    {rank >= 0 && (
                      <View style={[styles.rank, rank === 0 && styles.rankHero]}>
                        <Text style={styles.rankText}>{rank + 1}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
            <Text style={[styles.note, styles.pickStatus]}>
              {draft.length > 0 && draft.length < SCATTER_MIN
                ? L.export.scatterMin(SCATTER_MIN - draft.length)
                : draft.length >= SCATTER_MAX
                  ? L.export.scatterMax
                  : ' '}
            </Text>
            <View style={styles.pickActions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => {
                  setPicked([]);
                  setDraft(null);
                }}
              >
                <Text style={styles.btnGhostText}>{L.export.scatterAutoBtn}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  draft.length > 0 && draft.length < SCATTER_MIN && styles.disabled,
                ]}
                disabled={draft.length > 0 && draft.length < SCATTER_MIN}
                onPress={() => {
                  setPicked(draft);
                  setDraft(null);
                }}
              >
                <Text style={styles.btnPrimaryText}>{L.export.scatterValidate}</Text>
              </Pressable>
            </View>
          </View>
        )}
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
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: C.tan,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // Sélection par la bordure, pas par un fond plein : l'échantillon et le
  // schéma doivent rester lisibles dans leurs vraies couleurs.
  tileSelected: { borderColor: C.sienna, backgroundColor: C.card },
  tileLabel: { fontFamily: F.monoBold, fontSize: 13, color: C.ink, marginTop: 8 },
  tileLabelSelected: { color: C.sienna },
  tileHint: { fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 1 },
  sample: { fontSize: 22, color: C.ink, height: 34, lineHeight: 34 },
  note: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 8 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.card,
  },
  pickInfo: { flex: 1 },
  pickTitle: { fontFamily: F.monoBold, fontSize: 14, color: C.ink },
  pickBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.ink,
  },
  pickBtnText: { fontFamily: F.monoBold, fontSize: 14, color: C.paper },
  picker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.paper,
  },
  pickHint: { paddingHorizontal: 20, marginBottom: 8 },
  pickGrid: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  pickGridRow: { gap: 8 },
  thumb: {
    flex: 1 / 3,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  thumbSelected: { borderColor: C.sienna },
  thumbImg: { width: '100%', height: '100%' },
  rank: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.ink,
  },
  // La 1re choisie, celle du centre, se distingue des autres.
  rankHero: { backgroundColor: C.sienna },
  rankText: { fontFamily: F.monoBold, fontSize: 13, color: C.paper },
  pickStatus: { textAlign: 'center', paddingHorizontal: 20 },
  pickActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sketch: {
    width: 48,
    height: 64,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    overflow: 'hidden',
  },
  sketchLine: { height: 3, borderRadius: 1.5, backgroundColor: C.ink },
  sketchPhoto: { backgroundColor: C.muted },
  sketchPola: {
    position: 'absolute',
    width: 15,
    height: 17,
    backgroundColor: C.muted,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  sketchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 38,
    gap: 1,
    marginTop: 5,
  },
  sketchCell: { width: 12, height: 13, backgroundColor: C.muted },
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

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALBUM_BACKGROUND_GROUPS, BACKGROUND_GROUP_KEYS, C, F } from '../theme';
import { useLang } from '../i18n';
import { effectiveCover, SCATTER_MAX, SCATTER_MIN, validScatterPicks } from '../albumStyle';
import { autoMapIds, collectPlaces, mapPhotoIds, photoCoords } from '../albumMap';
import { appleMapsAvailable } from '../mapSnapshot';
import { PAGE_FORMAT_KEYS } from '../pageFormat';
import type {
  CommentSize,
  CoverStyle,
  DateFormat,
  ExportOptions,
  FrameStyle,
  PageFormat,
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
  onPreview: (options: ExportOptions, scatterIds: string[], coverTitle: string) => void;
  /** Titre de couverture enregistré pour ce dossier (vide = nom du dossier). */
  coverTitle?: string;
  /** Nom du dossier : titre par défaut de la couverture. */
  folderName: string;
  /** Enregistre la carte de chaque photo (`undefined` = d'office, cf. `Photo.mapMode`). */
  onSetMapModes?: (modes: Record<string, Photo['mapMode']>) => void;
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
const COMMENT_SIZE_KEYS: CommentSize[] = ['normal', 'large', 'xlarge'];
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

/** Rubriques repliables de l'écran (une seule ouverte à la fois). */
type SectionKey = 'style' | 'photos' | 'texts' | 'maps';

/** Assemble le résumé d'une rubrique en sautant les parties absentes. */
function joinSummary(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

/**
 * Rubrique repliable : titre et résumé des choix en cours sur une ligne,
 * réglages dépliés au toucher. Le résumé suffit à relire la mise en page
 * sans rien ouvrir.
 */
function Section({
  title,
  summary,
  swatch,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  /** Couleur résumée par une pastille (fond de l'album). */
  swatch?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, open && styles.sectionOpen]}>
      <Pressable
        style={styles.sectionHead}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={summary}
      >
        <View style={styles.sectionText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
            {!!swatch && <View style={[styles.summaryDot, { backgroundColor: swatch }]} />}
          </View>
        </View>
        <Text style={[styles.chevron, open && styles.chevronOpen]}>›</Text>
      </Pressable>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

/** Réglage oui/non : libellé à gauche, interrupteur iOS à droite. */
function SwitchRow({
  label,
  hint,
  value,
  onChange,
  first,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Premier réglage de la rubrique : pas de marge haute. */
  first?: boolean;
}) {
  return (
    <View style={[styles.switchBlock, first && styles.switchFirst]}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: C.sienna, false: C.tan }}
          ios_backgroundColor={C.tan}
          accessibilityLabel={label}
        />
      </View>
      {!!hint && <Text style={styles.switchHint}>{hint}</Text>}
    </View>
  );
}

/**
 * Silhouette d'une page au format choisi, à l'échelle (A4 21 × 29,7 cm ;
 * 16 × 21 ; 16 × 16 cm) : la différence de taille se voit avant même de lire.
 */
function FormatSketch({ format }: { format: PageFormat }) {
  const cm = 2.1; // points d'écran par centimètre
  const [w, h] = format === 'a4' ? [21, 29.7] : format === '16x21' ? [16, 21] : [16, 16];
  return (
    <View style={styles.formatBox}>
      <View style={[styles.formatPage, { width: w * cm, height: h * cm }]}>
        <View style={[styles.sketchPhoto, { width: w * cm - 12, height: h * cm * 0.38 }]} />
        <View style={[styles.sketchPhoto, { width: w * cm - 12, height: h * cm * 0.38 }]} />
      </View>
    </View>
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
  coverTitle = '',
  folderName,
  preparing,
  onSetMapModes,
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
  const photoMapCount = useMemo(() => mapPhotoIds(photos).size, [photos]);
  // Choix des cartes photo par photo : brouillon (photos avec carte) pendant le
  // panneau, enregistré seulement à « Valider ».
  const geoPhotos = useMemo(() => images.filter((p) => !!photoCoords(p)), [images]);
  const [mapDraft, setMapDraft] = useState<Set<string> | null>(null);
  const toggleMap = (id: string) =>
    setMapDraft((d) => {
      const next = new Set(d ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const validateMaps = () => {
    if (!mapDraft) return;
    // Un choix identique à la règle d'office redevient « d'office » : il suivra
    // alors les changements d'ordre ou de lieu du dossier.
    const auto = autoMapIds(photos);
    const modes: Record<string, Photo['mapMode']> = {};
    for (const p of geoPhotos) {
      const want = mapDraft.has(p.id);
      modes[p.id] = want === auto.has(p.id) ? undefined : want ? 'on' : 'off';
    }
    onSetMapModes?.(modes);
    setMapDraft(null);
  };
  // Titre de la couverture : brouillon prérempli du nom du dossier, avec ses
  // retours à la ligne. Enregistré à « Aperçu ».
  const [titleDraft, setTitleDraft] = useState('');

  // Rubrique dépliée (aucune à l'ouverture : l'écran se lit d'un coup d'œil).
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const toggleSection = (key: SectionKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSection((cur) => (cur === key ? null : key));
  };

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
    setMapDraft(null);
    setOpenSection(null);
    setTitleDraft(coverTitle || folderName);
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
          {/* Rubriques repliables : chacune résume ses choix en une ligne, une
              seule s'ouvre à la fois. L'écran alignait jusqu'à seize réglages à
              plat — on ne déplie que ce qu'on veut changer. */}

          {/* Style : typographie, couverture et fond — familial seulement (le
              pro garde sa page de garde factuelle en Montserrat, sur fond
              blanc). En tête : ce sont les choix qui changent le plus l'allure
              de l'album. */}
          {!isPro && (
            <Section
              title={L.export.sections.style}
              summary={joinSummary(
                L.export.formats[options.format],
                L.export.typefaces[options.typeface],
                L.export.covers[options.cover],
              )}
              swatch={options.background}
              open={openSection === 'style'}
              onToggle={() => toggleSection('style')}
            >
              {/* Titre de la couverture : le nom du dossier par défaut ; aller à
                  la ligne coupe le titre là où on le veut (3 lignes au plus). */}
              <Text style={[styles.label, styles.labelFirst]}>{L.export.coverTitleLabel}</Text>
              <TextInput
                style={styles.titleInput}
                value={titleDraft}
                onChangeText={(t) => setTitleDraft(t.split('\n').slice(0, 3).join('\n'))}
                placeholder={folderName}
                placeholderTextColor={C.faint}
                multiline
                maxLength={90}
                autoCorrect
                spellCheck
                autoCapitalize="sentences"
                textAlign="center"
                accessibilityLabel={L.export.coverTitleLabel}
              />
              <Text style={styles.note}>{L.export.coverTitleHint}</Text>

              <Text style={styles.label}>{L.export.formatLabel}</Text>
              <View style={styles.tiles}>
                {PAGE_FORMAT_KEYS.map((value) => (
                  <Tile
                    key={value}
                    label={L.export.formats[value]}
                    hint={L.export.formatHints[value]}
                    selected={options.format === value}
                    onPress={() => setOptions((o) => ({ ...o, format: value }))}
                  >
                    <FormatSketch format={value} />
                  </Tile>
                ))}
              </View>

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

              <Text style={styles.label}>{L.export.bgLabel}</Text>
              {/* Réglage d'ALBUM : chaque page se recolore ensuite dans l'aperçu. */}
              <Text style={[styles.note, styles.bgHint]}>{L.export.bgHint}</Text>
              {BACKGROUND_GROUP_KEYS.map((group) => (
                <View key={group} style={styles.bgGroup}>
                  <Text style={styles.bgGroupLabel}>{L.export.bgGroups[group]}</Text>
                  <View style={styles.chips}>
                    {ALBUM_BACKGROUND_GROUPS[group].map((color) => {
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
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        />
                      );
                    })}
                  </View>
                </View>
              ))}
            </Section>
          )}

          {/* Photos. Taille et liseré n'existent qu'en familial : le gabarit
              pro impose une photo pleine largeur. */}
          <Section
            title={L.export.sections.photos}
            summary={joinSummary(
              !isPro && L.export.sizes[options.photoSize],
              L.export.frames[options.frame],
              !isPro && options.liseret && L.export.sumLiseret,
            )}
            open={openSection === 'photos'}
            onToggle={() => toggleSection('photos')}
          >
            {!isPro && (
              <>
                <Text style={[styles.label, styles.labelFirst]}>{L.export.sizeLabel}</Text>
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
              </>
            )}

            <Text style={[styles.label, isPro && styles.labelFirst]}>
              {L.export.frameLabel}
            </Text>
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
              <SwitchRow
                label={L.export.liseretLabel}
                value={options.liseret}
                onChange={(liseret) => setOptions((o) => ({ ...o, liseret }))}
              />
            )}
          </Section>

          {/* Textes : commentaire (familial), lieu, date, pages de texte. */}
          <Section
            title={L.export.sections.texts}
            summary={joinSummary(
              isPro
                ? L.export.sumProText(L.export.commentSizes[options.proTextSize]) +
                  (options.proTextBold ? ` · ${L.export.sumBold}` : '')
                : L.export.sumComment(L.export.commentSizes[options.commentSize]),
              options.showPlace && L.export.sumPlace,
              options.dateFormat === 'none'
                ? L.export.sumNoDate
                : L.export.sumDate(L.export.dateFormats[options.dateFormat]),
            )}
            open={openSection === 'texts'}
            onToggle={() => toggleSection('texts')}
          >
            {!isPro && (
              <>
                <Text style={[styles.label, styles.labelFirst]}>
                  {L.export.commentSizeLabel}
                </Text>
                <View style={styles.chips}>
                  {COMMENT_SIZE_KEYS.map((value) => (
                    <Chip
                      key={value}
                      selected={options.commentSize === value}
                      label={L.export.commentSizes[value]}
                      onPress={() => setOptions((o) => ({ ...o, commentSize: value }))}
                    />
                  ))}
                </View>

                {/* Alignement des textes : commentaires sous les photos ET pages
                    de texte. Juste sous la taille, là où on le cherche. */}
                <Text style={styles.label}>{L.export.textAlignLabel}</Text>
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

                <Text style={styles.label}>{L.export.commentPosLabel}</Text>
                <View style={styles.chips}>
                  {COMMENT_POS_KEYS.map((value) => (
                    <Chip
                      key={value}
                      selected={options.commentVAlign === value}
                      label={L.export.commentPos[value]}
                      onPress={() => setOptions((o) => ({ ...o, commentVAlign: value }))}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Pro : corps du texte des fiches et des pages de texte (pendant de
                la taille des commentaires du Loisir). */}
            {isPro && (
              <>
                <Text style={[styles.label, styles.labelFirst]}>{L.export.proTextSizeLabel}</Text>
                <View style={styles.chips}>
                  {COMMENT_SIZE_KEYS.map((value) => (
                    <Chip
                      key={value}
                      selected={options.proTextSize === value}
                      label={L.export.commentSizes[value]}
                      onPress={() => setOptions((o) => ({ ...o, proTextSize: value }))}
                    />
                  ))}
                </View>
                <SwitchRow
                  label={L.export.proTextBoldLabel}
                  value={options.proTextBold}
                  onChange={(proTextBold) => setOptions((o) => ({ ...o, proTextBold }))}
                />
              </>
            )}

            <SwitchRow
              label={L.export.placeLabel}
              value={options.showPlace}
              onChange={(showPlace) => setOptions((o) => ({ ...o, showPlace }))}
            />

            <Text style={styles.label}>{L.export.dateLabel}</Text>
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
                <Text style={styles.label}>{L.export.datePosLabel}</Text>
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

            {/* Pro : la fiche descriptive reste à gauche, l'alignement ne vaut
                que pour les pages de texte. */}
            {isPro && (
              <>
                <Text style={styles.label}>{L.export.textAlignProLabel}</Text>
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
              </>
            )}
          </Section>

          {/* Cartes : à côté des photos et page « Nos lieux » — familial
              seulement, et seulement avec des photos géolocalisées. */}
          {!isPro && (
            <Section
              title={L.export.sections.maps}
              summary={
                placeCount === 0
                  ? L.export.sumNoPlaces
                  : joinSummary(
                      options.photoMaps
                        ? L.export.photoMapsChosen(photoMapCount)
                        : L.export.sumNoMaps,
                      options.showMap && L.export.sumMapPage,
                    )
              }
              open={openSection === 'maps'}
              onToggle={() => toggleSection('maps')}
            >
              {placeCount > 0 ? (
                <>
                  <SwitchRow
                    label={L.export.photoMapsLabel}
                    hint={L.export.photoMapsHint}
                    value={options.photoMaps}
                    onChange={(photoMaps) => setOptions((o) => ({ ...o, photoMaps }))}
                    first
                  />
                  {options.photoMaps && !!onSetMapModes && (
                    <View style={styles.pickRow}>
                      <View style={styles.pickInfo}>
                        <Text style={styles.pickTitle}>{L.export.photoMapsPick}</Text>
                        <Text style={styles.note}>{L.export.photoMapsChosen(photoMapCount)}</Text>
                      </View>
                      <Pressable
                        style={styles.pickBtn}
                        onPress={() => setMapDraft(mapPhotoIds(photos))}
                        accessibilityRole="button"
                      >
                        <Text style={styles.pickBtnText}>{L.export.scatterChoose}</Text>
                      </Pressable>
                    </View>
                  )}
                  {options.photoMaps && !appleMapsAvailable && (
                    <Text style={styles.note}>{L.export.photoMapsOffline}</Text>
                  )}

                  <SwitchRow
                    label={L.export.mapLabel}
                    hint={L.export.mapHint(placeCount)}
                    value={options.showMap}
                    onChange={(showMap) => setOptions((o) => ({ ...o, showMap }))}
                  />
                </>
              ) : (
                <Text style={[styles.note, styles.noteFirst]}>{L.export.mapNone}</Text>
              )}
            </Section>
          )}
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
            onPress={() => onPreview(options, picked, titleDraft)}
          >
            {preparing ? (
              <ActivityIndicator color={C.paper} />
            ) : (
              <Text style={styles.btnPrimaryText}>{L.export.previewBtn} →</Text>
            )}
          </Pressable>
        </View>

        {/* Choix des cartes, photo par photo : même surcouche que le pêle-mêle. */}
        {mapDraft && (
          <View
            style={[
              styles.picker,
              { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.header}>
              <Pressable
                onPress={() => setMapDraft(null)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={L.common.cancel}
              >
                <Text style={styles.close}>✕</Text>
              </Pressable>
              <Text style={styles.title} numberOfLines={1}>
                {L.export.photoMapsPick}
              </Text>
              <Text style={styles.badge}>{`${mapDraft.size} / ${geoPhotos.length}`}</Text>
            </View>
            <Text style={[styles.note, styles.pickHint]}>{L.export.photoMapsPickHint}</Text>
            <FlatList
              data={geoPhotos}
              keyExtractor={(p) => p.id}
              numColumns={3}
              contentContainerStyle={styles.pickGrid}
              columnWrapperStyle={styles.pickGridRow}
              renderItem={({ item }) => {
                const on = mapDraft.has(item.id);
                return (
                  <Pressable
                    style={styles.mapItem}
                    onPress={() => toggleMap(item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[styles.mapThumb, on && styles.thumbSelected]}>
                      <Image
                        source={{ uri: item.uri }}
                        style={[styles.thumbImg, !on && styles.mapOff]}
                      />
                      {on && (
                        <View style={[styles.rank, styles.rankHero]}>
                          <Text style={styles.rankText}>✓</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.mapPlace} numberOfLines={1}>
                      {item.place?.split(',')[0]?.trim() || L.export.photoMapsNoName}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <View style={styles.pickActions}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setMapDraft(autoMapIds(photos))}
              >
                <Text style={styles.btnGhostText}>{L.export.scatterAutoBtn}</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={validateMaps}>
                <Text style={styles.btnPrimaryText}>{L.export.scatterValidate}</Text>
              </Pressable>
            </View>
          </View>
        )}

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
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 12 },
  // Rubrique : carte claire sur le fond crème, titre + résumé, chevron.
  section: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  sectionOpen: { borderColor: C.sienna },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 72,
  },
  sectionText: { flex: 1 },
  sectionTitle: { fontFamily: F.display, fontSize: 18, color: C.ink },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  summary: { flexShrink: 1, fontFamily: F.mono, fontSize: 13, color: C.inkSoft },
  summaryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.line,
  },
  chevron: { fontFamily: F.mono, fontSize: 26, color: C.muted, lineHeight: 28 },
  chevronOpen: { transform: [{ rotate: '90deg' }], color: C.sienna },
  sectionBody: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  label: {
    // Intitulé d'un réglage dans sa rubrique : gras, encre franche, sans
    // majuscules — la rubrique porte déjà le titre fort. `fontWeight` serait
    // ignoré sur iOS avec une famille custom : c'est la clé `F` qui porte la
    // graisse.
    fontFamily: F.monoBold,
    fontSize: 14,
    color: C.ink,
    marginTop: 22,
    marginBottom: 10,
  },
  labelFirst: { marginTop: 0 },
  switchBlock: { marginTop: 22 },
  switchFirst: { marginTop: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { flex: 1, fontFamily: F.monoBold, fontSize: 14, color: C.ink },
  switchHint: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 17 },
  noteFirst: { marginTop: 0 },
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
  mapItem: { flex: 1 / 3 },
  mapThumb: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  // Photo sans carte : estompée, pour lire d'un coup d'œil ce qui en aura une.
  mapOff: { opacity: 0.45 },
  mapPlace: { fontFamily: F.mono, fontSize: 11, color: C.muted, marginTop: 4 },
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
  // Cadre fixe : les deux silhouettes s'alignent par le bas, à la même échelle.
  formatBox: { height: 64, justifyContent: 'flex-end', alignItems: 'center' },
  formatPage: {
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'space-evenly',
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
  bgGroup: { marginBottom: 12 },
  titleInput: {
    minHeight: 64,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#ffffff',
    fontFamily: F.monoBold,
    fontSize: 17,
    lineHeight: 23,
    color: C.ink,
  },
  bgHint: { marginTop: -4, marginBottom: 12 },
  bgGroupLabel: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginBottom: 6 },
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

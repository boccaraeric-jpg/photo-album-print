import { useEffect, useRef, useState } from 'react';
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
import { WebView } from 'react-native-webview';

import { ALBUM_BACKGROUNDS, C, F } from '../theme';
import { useLang } from '../i18n';
import { stripMarks } from '../richText';
import { pageBackground } from '../paginate';
import type { Photo, PhotoSize } from '../types';

/** Réglages d'une entrée depuis l'aperçu ; `null` = revenir à celui de l'album. */
export interface EntryPatch {
  size?: PhotoSize | null;
  pageBg?: string | null;
}

const SIZE_KEYS: PhotoSize[] = ['small', 'medium', 'large', 'full'];
const EDIT_SCHEME = 'comclic-edit://e/';

interface Props {
  visible: boolean;
  /** HTML complet du mini album (identique au futur PDF). */
  html: string | null;
  /** Vrai pendant la génération/partage du fichier final. */
  sending: boolean;
  /** Libellé du bouton d'envoi (« Partager l'album » ou « Envoyer »). */
  sendLabel: string;
  /** Avancement affiché pendant un envoi long (« Photos 12/50… »), sinon null. */
  progress?: string | null;
  /** Revenir à l'album pour en modifier le contenu (photos, ordre, textes). */
  onBackToAlbum: () => void;
  /** Revenir aux options de mise en page. */
  onEditLayout: () => void;
  /** Ouvrir le choix du format et envoyer. */
  onSend: () => void;
  /**
   * Aperçu interactif (familial) : entrées du dossier, taille de l'album, et
   * réglage d'une entrée touchée. Absent → aperçu en lecture seule (pro).
   */
  entries?: Photo[];
  albumSize?: PhotoSize;
  /** Fond de l'album : la pastille en cours quand la page n'a pas le sien. */
  albumBg?: string;
  /** `pageIds` : entrées de la même page (le fond est commun à la page). */
  onEditEntry?: (id: string, patch: EntryPatch, pageIds: string[]) => void;
  /** Entrée à remettre à l'écran après un nouveau rendu (celle qu'on règle). */
  focusId?: string | null;
  /** Vrai pendant la reconstruction de l'aperçu après un réglage. */
  refreshing?: boolean;
}

/**
 * Aperçu plein écran avant envoi. Rend exactement le même HTML que le PDF dans
 * une WebView, pour que ce que l'utilisateur voit corresponde au fichier généré.
 * Deux façons de revenir en arrière : modifier le contenu de l'album, ou ajuster
 * seulement la mise en page.
 */
export function PreviewModal({
  visible,
  html,
  sending,
  sendLabel,
  progress,
  onBackToAlbum,
  onEditLayout,
  onSend,
  entries,
  albumSize = 'medium',
  albumBg,
  onEditEntry,
  focusId,
  refreshing = false,
}: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const editable = !!onEditEntry && !!entries;
  // Entrée touchée dans l'aperçu et les entrées de sa page (panneau ouvert).
  const [target, setTarget] = useState<{ id: string; pageIds: string[] } | null>(null);
  const selected = target ? entries?.find((e) => e.id === target.id) : undefined;
  // Fond affiché par la page : celui de la première de ses entrées qui en a un.
  const pageBg = target
    ? pageBackground((entries ?? []).filter((e) => target.pageIds.includes(e.id)))
    : undefined;
  const edit = (patch: EntryPatch) => selected && onEditEntry?.(selected.id, patch, target?.pageIds ?? [selected.id]);
  useEffect(() => {
    if (!visible) setTarget(null);
  }, [visible]);

  // Retour au même endroit après un réglage : le nouvel aperçu se charge en
  // haut de l'album. Une fois chargé, l'app le fait défiler jusqu'à l'entrée
  // réglée (`injectJavaScript`, exécuté par l'app et non par le document — dont
  // la politique de sécurité interdit toujours tout script venu de l'album), et
  // le garde masqué jusque-là : on ne voit pas le saut vers la couverture.
  // (`injectedJavaScript`, posé au chargement, ne s'exécutait pas sur l'iPhone.)
  const webRef = useRef<WebView>(null);
  const safeFocus = focusId && /^[A-Za-z0-9-]+$/.test(focusId) ? focusId : null;
  const [placedHtml, setPlacedHtml] = useState<string | null>(null);
  const hidden = !!safeFocus && !!html && placedHtml !== html;
  const placeFocus = () => {
    if (!safeFocus || !html) return;
    webRef.current?.injectJavaScript(
      `(function(){var e=document.getElementById('e-${safeFocus}');` +
        `if(e){e.scrollIntoView({block:'start'});window.scrollBy(0,-12);}})();true;`,
    );
    // Le défilement est immédiat ; on laisse une image s'afficher avant de montrer.
    const done = html;
    setTimeout(() => setPlacedHtml(done), 60);
  };
  // Filet de sécurité : jamais d'aperçu masqué plus d'une seconde.
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setPlacedHtml(html), 1000);
    return () => clearTimeout(t);
  }, [hidden, html]);

  // Valeurs réellement en vigueur pour l'entrée touchée (affichées en couleur).
  const currentSize: PhotoSize = selected?.size ?? albumSize;
  const currentBg = pageBg ?? albumBg;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBackToAlbum}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable hitSlop={10} onPress={onBackToAlbum} disabled={sending}>
            <Text style={styles.backLink}>{L.preview.editAlbum}</Text>
          </Pressable>
          <Text style={styles.title}>{L.preview.title}</Text>
          <Text style={styles.subtitle}>
            {editable ? L.preview.subtitleEditable : L.preview.subtitle}
          </Text>
        </View>

        <View style={styles.webWrap}>
          {html ? (
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html }}
              // Défense en profondeur : l'album est un document statique, sa
              // politique de sécurité (CSP) interdit tout script et toute
              // ressource externe. Seul le script de l'app (`placeFocus`,
              // recentrage après un réglage) s'exécute, en aperçu interactif.
              javaScriptEnabled={editable}
              onLoadEnd={editable ? placeFocus : undefined}
              // Toucher une photo = suivre son lien `comclic-edit://e/<id>` :
              // intercepté ici, il ouvre le panneau de réglage. Aucune
              // navigation vers le web ne part de l'aperçu.
              onShouldStartLoadWithRequest={(req) => {
                if (req.url.startsWith(EDIT_SCHEME)) {
                  if (editable) {
                    const [id, ids = ''] = req.url.slice(EDIT_SCHEME.length).split('/');
                    const pageIds = ids.split(',').filter(Boolean).map(decodeURIComponent);
                    const one = decodeURIComponent(id);
                    setTarget({ id: one, pageIds: pageIds.length ? pageIds : [one] });
                  }
                  return false;
                }
                return !/^https?:/i.test(req.url) && !req.url.startsWith('comclic-');
              }}
              style={[styles.web, hidden && styles.webHidden]}
              scrollEnabled
              showsVerticalScrollIndicator
            />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#A64B24" />
            </View>
          )}
        </View>

        {refreshing && (
          <View style={styles.refreshing} pointerEvents="none">
            <ActivityIndicator color={C.sienna} />
          </View>
        )}

        {/* Panneau de réglage de l'entrée touchée : surcouche <View>, pas de
            <Modal> imbriqué (iOS ne les présente pas). Chaque choix redessine
            l'aperçu aussitôt ; « OK » referme. */}
        {selected && editable && (
          <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle} numberOfLines={1}>
                {selected.kind === 'text'
                  ? L.preview.textPage
                  : stripMarks(selected.comment).trim() || selected.place || ' '}
              </Text>
              <Pressable
                style={styles.doneBtn}
                onPress={() => setTarget(null)}
                accessibilityRole="button"
              >
                <Text style={styles.doneText}>{L.preview.done}</Text>
              </Pressable>
            </View>
            <ScrollView>
              {selected.kind !== 'text' && (
                <>
                  <Text style={styles.panelLabel}>{L.preview.entrySize}</Text>
                  <View style={styles.chips}>
                    {SIZE_KEYS.map((size) => (
                      <Chip
                        key={size}
                        label={L.export.sizes[size]}
                        selected={currentSize === size}
                        onPress={() => size !== currentSize && edit({ size })}
                      />
                    ))}
                  </View>
                  {selected.size ? (
                    <Pressable onPress={() => edit({ size: null })} hitSlop={8}>
                      <Text style={styles.reset}>
                        {L.preview.resetSize(L.export.sizes[albumSize])}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.hint}>{L.preview.sizeIsAlbum}</Text>
                  )}
                </>
              )}
              <Text style={styles.panelLabel}>{L.preview.entryBg}</Text>
              <View style={styles.chips}>
                {ALBUM_BACKGROUNDS.map((color) => {
                  const on = currentBg === color;
                  return (
                    <Pressable
                      key={color}
                      style={[styles.swatch, { backgroundColor: color }, on && styles.swatchSelected]}
                      onPress={() => !on && edit({ pageBg: color })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      {on && (
                        <Text style={[styles.swatchCheck, isDarkHex(color) && styles.swatchCheckLight]}>
                          ✓
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {pageBg ? (
                <Pressable onPress={() => edit({ pageBg: null })} hitSlop={8}>
                  <Text style={styles.reset}>{L.preview.resetBg}</Text>
                </Pressable>
              ) : (
                <Text style={styles.hint}>{L.preview.bgIsAlbum}</Text>
              )}
            </ScrollView>
          </View>
        )}

        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={onEditLayout}
            disabled={sending}
          >
            <Text style={styles.btnGhostText}>{L.preview.layout}</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary, sending && styles.btnDisabled]}
            onPress={onSend}
            disabled={sending || !html}
          >
            {sending ? (
              <View style={styles.progressRow}>
                <ActivityIndicator color="#fff" />
                {progress ? <Text style={styles.btnPrimaryText}>{progress}</Text> : null}
              </View>
            ) : (
              <Text style={styles.btnPrimaryText}>{sendLabel} →</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Vrai si la couleur (hex 6 chiffres) est sombre : coche blanche sur la pastille. */
function isDarkHex(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128;
}

/** Puce de choix du panneau (même allure que celles de la mise en page). */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
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
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  refreshing: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: C.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  panelTitle: { flex: 1, fontFamily: F.monoBold, fontSize: 15, color: C.ink },
  doneBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.ink,
  },
  doneText: { fontFamily: F.monoBold, fontSize: 14, color: C.paper },
  panelLabel: { fontFamily: F.monoBold, fontSize: 13, color: C.muted, marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: C.tan,
  },
  chipSelected: { backgroundColor: C.sienna },
  chipText: { fontFamily: F.monoBold, fontSize: 14, color: C.ink },
  chipTextSelected: { color: '#fff' },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderWidth: 3, borderColor: C.sienna },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  backLink: {
    fontFamily: F.monoBold,
    fontSize: 16,
    color: '#A64B24',
    marginBottom: 6,
  },
  title: { fontFamily: F.display, fontSize: 20, color: '#201B14' },
  subtitle: { fontFamily: F.mono, fontSize: 13, color: '#6b7280', marginTop: 2 },
  webWrap: { flex: 1, backgroundColor: '#e5e7eb' },
  web: { flex: 1, backgroundColor: 'transparent' },
  webHidden: { opacity: 0 },
  reset: { fontFamily: F.monoBold, fontSize: 13, color: C.sienna, marginTop: 10 },
  hint: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 10 },
  swatchCheck: { fontFamily: F.monoBold, fontSize: 16, color: C.ink },
  swatchCheckLight: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toolbar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ececec',
  },
  btn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#f3f4f6' },
  btnGhostText: { fontFamily: F.monoBold, color: '#374151', fontSize: 16 },
  btnPrimary: { backgroundColor: '#A64B24' },
  btnPrimaryText: { fontFamily: F.monoBold, color: '#fff', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

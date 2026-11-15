import { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';
import { useLang } from '../i18n';
import { HELP_IDS, helpContent, type HelpId } from '../helpContent';

interface Props {
  visible: boolean;
  /** Rubrique ouverte à l'arrivée : celle de l'écran d'où l'aide est appelée. */
  initial?: HelpId;
  onClose: () => void;
}

/**
 * Écran d'aide : mode d'emploi de l'app en rubriques repliables (une seule
 * ouverte à la fois, comme la mise en page). Plein écran, même gabarit que
 * `ExportModal` : en-tête ✕ + titre, corps défilant. Les textes vivent dans
 * `src/helpContent.ts`.
 */
export function HelpModal({ visible, initial, onClose }: Props) {
  const { L, lang } = useLang();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<HelpId | null>(initial ?? null);
  const scroll = useRef<ScrollView>(null);
  const tops = useRef<Partial<Record<HelpId, number>>>({});
  const content = helpContent(lang);

  // À chaque ouverture : la rubrique de l'écran appelant, amenée à l'écran.
  useEffect(() => {
    if (!visible) return;
    setOpen(initial ?? null);
    const t = setTimeout(() => {
      const y = initial ? tops.current[initial] : 0;
      scroll.current?.scrollTo({ y: Math.max(0, (y ?? 0) - 8), animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [visible, initial]);

  const toggle = (id: HelpId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((cur) => (cur === id ? null : id));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={14}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={L.common.close}
          >
            <Ionicons name="close" size={22} color={C.ink} />
          </Pressable>
          <Text style={styles.title}>{content.title}</Text>
          <View style={styles.close} />
        </View>

        <ScrollView
          ref={scroll}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 28 }]}
        >
          <Text style={styles.intro}>{content.intro}</Text>
          {HELP_IDS.map((id) => {
            const section = content.sections[id];
            const on = open === id;
            return (
              <View
                key={id}
                style={styles.section}
                onLayout={(e) => {
                  tops.current[id] = e.nativeEvent.layout.y;
                }}
              >
                <Pressable
                  style={styles.sectionHead}
                  onPress={() => toggle(id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: on }}
                >
                  <Text style={[styles.sectionTitle, on && styles.sectionTitleOn]}>
                    {section.title}
                  </Text>
                  <Ionicons
                    name={on ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={on ? C.sienna : C.muted}
                  />
                </Pressable>
                {on && (
                  <View style={styles.sectionBody}>
                    {section.body.map((line, i) =>
                      line.startsWith('• ') ? (
                        <View key={i} style={styles.bullet}>
                          <Text style={styles.dot}>•</Text>
                          <Text style={[styles.text, styles.bulletText]}>{line.slice(2)}</Text>
                        </View>
                      ) : (
                        <Text key={i} style={styles.text}>
                          {line}
                        </Text>
                      ),
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Bouton « ? » qui ouvre l'aide : pastille ronde, au gabarit des boutons
 * d'action des cartes.
 */
export function HelpButton({ onPress }: { onPress: () => void }) {
  const { L } = useLang();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.helpBtn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={L.common.help}
    >
      {/* « ? » en lettre grasse plutôt qu'en pictogramme fin : le bouton
          passait inaperçu (retour testeur). */}
      <Text style={styles.helpMark}>?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.display, fontSize: 20, color: C.ink },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  intro: {
    fontFamily: F.mono,
    fontSize: 15,
    lineHeight: 22,
    color: C.inkSoft,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  section: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 54,
    paddingVertical: 12,
  },
  sectionTitle: { flex: 1, fontFamily: F.monoBold, fontSize: 16, color: C.ink },
  sectionTitleOn: { color: C.sienna },
  sectionBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 9 },
  text: { fontFamily: F.mono, fontSize: 15, lineHeight: 22, color: C.inkSoft },
  bullet: { flexDirection: 'row', gap: 8 },
  dot: { fontFamily: F.monoBold, fontSize: 15, lineHeight: 22, color: C.sienna },
  bulletText: { flex: 1 },
  helpBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.tan,
    borderWidth: 2,
    borderColor: C.sienna,
    // Détaché de la ligne du dessus (sélecteur FR / EN sur l'accueil).
    marginTop: 8,
  },
  helpMark: {
    fontFamily: F.display,
    fontSize: 21,
    lineHeight: 25,
    color: C.sienna,
    textAlign: 'center',
    includeFontPadding: false,
  },
  pressed: { opacity: 0.6 },
});

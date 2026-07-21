import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SpellMatch } from '../spellcheck';
import { F } from '../theme';

interface Props {
  visible: boolean;
  /** Texte d'origine analysé. */
  text: string;
  /** Fautes détectées (ordre de lecture). */
  matches: SpellMatch[];
  /** Appelé à CHAQUE correction avec le texte à jour (application immédiate). */
  onApply: (corrected: string) => void;
  onClose: () => void;
}

const CONTEXT = 32;

/**
 * Assistant de correction, rendu comme **surcouche** (pas un Modal) car il
 * s'affiche par-dessus l'éditeur de commentaire — or iOS ne sait pas présenter
 * deux Modal imbriqués. Présente chaque faute avec ses suggestions ; chaque
 * choix est appliqué immédiatement (les positions suivantes sont recalées).
 */
export function SpellCheckModal({
  visible,
  text,
  matches,
  onApply,
  onClose,
}: Props) {
  const [index, setIndex] = useState(0);
  const [workText, setWorkText] = useState(text);
  const [items, setItems] = useState<SpellMatch[]>(matches);

  // Initialise UNIQUEMENT à l'ouverture. Ne pas ajouter `text`/`matches` aux
  // dépendances : onApply met à jour le texte du parent (qui revient en prop),
  // ce qui réinitialiserait l'assistant en plein parcours.
  useEffect(() => {
    if (visible) {
      setIndex(0);
      setWorkText(text);
      setItems(matches);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const match = items[index];
  if (!visible || !match) return null;

  const goNext = () => {
    if (index + 1 >= items.length) onClose();
    else setIndex(index + 1);
  };

  const choose = (value: string) => {
    const newText =
      workText.slice(0, match.offset) +
      value +
      workText.slice(match.offset + match.length);
    const delta = value.length - match.length;
    // Recale les fautes suivantes (offsets postérieurs) après ce remplacement.
    setItems((prev) =>
      prev.map((it, i) =>
        i > index ? { ...it, offset: it.offset + delta } : it,
      ),
    );
    setWorkText(newText);
    onApply(newText); // application immédiate côté champ commentaire
    goNext();
  };

  const before = workText.slice(
    Math.max(0, match.offset - CONTEXT),
    match.offset,
  );
  const bad = workText.substr(match.offset, match.length);
  const after = workText.slice(
    match.offset + match.length,
    match.offset + match.length + CONTEXT,
  );

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
          <Text style={styles.progress}>
            Faute {index + 1} sur {items.length}
          </Text>

          <Text style={styles.context}>
            {match.offset > CONTEXT ? '…' : ''}
            {before}
            <Text style={styles.bad}>{bad}</Text>
            {after}
            {match.offset + match.length + CONTEXT < workText.length ? '…' : ''}
          </Text>

          {match.suggestions.length > 0 ? (
            <>
              <Text style={styles.label}>Remplacer par :</Text>
              <ScrollView
                style={styles.suggScroll}
                keyboardShouldPersistTaps="handled"
              >
                {match.suggestions.map((s) => (
                  <Pressable
                    key={s}
                    style={styles.sugg}
                    onPress={() => choose(s)}
                  >
                    <Text style={styles.suggText}>{s}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <Text style={styles.noSugg}>Aucune suggestion proposée.</Text>
          )}

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Fermer</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnLight]} onPress={goNext}>
              <Text style={styles.btnLightText}>Ignorer</Text>
            </Pressable>
          </View>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 20,
    elevation: 20,
  },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  progress: {
    fontFamily: F.monoBold,
    fontSize: 12,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  context: {
    fontFamily: F.mono,
    fontSize: 16,
    lineHeight: 23,
    color: '#374151',
    marginBottom: 10,
  },
  bad: {
    fontFamily: F.monoBold,
    color: '#dc2626',
    textDecorationLine: 'underline',
  },
  label: {
    fontFamily: F.monoBold,
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noSugg: {
    fontFamily: F.mono,
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 4,
  },
  suggScroll: { maxHeight: 220 },
  sugg: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#EADDC4',
    marginBottom: 8,
  },
  suggText: { fontFamily: F.monoBold, fontSize: 16, color: '#A64B24' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#f3f4f6' },
  btnGhostText: { fontFamily: F.monoBold, color: '#374151', fontSize: 15 },
  btnLight: { backgroundColor: '#fef3c7' },
  btnLightText: { fontFamily: F.monoBold, color: '#b45309', fontSize: 15 },
});

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { F } from '../theme';
import type { Photo } from '../types';
import { checkSpelling, type SpellMatch } from '../spellcheck';
import { SpellCheckModal } from './SpellCheckModal';

interface Props {
  /** Photo en cours d'édition, ou null si le modal est fermé. */
  photo: Photo | null;
  onSave: (id: string, comment: string, place: string) => void;
  onClose: () => void;
}

export function CommentModal({ photo, onSave, onClose }: Props) {
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [checking, setChecking] = useState(false);
  const [matches, setMatches] = useState<SpellMatch[]>([]);
  const [spellVisible, setSpellVisible] = useState(false);

  useEffect(() => {
    setText(photo?.comment ?? '');
    setPlace(photo?.place ?? '');
  }, [photo]);

  const runSpellCheck = async () => {
    if (!text.trim() || checking) return;
    setChecking(true);
    try {
      const found = await checkSpelling(text);
      if (found.length === 0) {
        Alert.alert('Orthographe', 'Aucune faute détectée.');
      } else {
        setMatches(found);
        setSpellVisible(true);
      }
    } catch {
      Alert.alert(
        'Correcteur indisponible',
        "La vérification n'a pas pu aboutir. Réessaie.",
      );
    } finally {
      setChecking(false);
    }
  };

  const isText = photo?.kind === 'text';

  return (
    <Modal
      visible={photo !== null}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {photo && !isText && (
              <Image
                source={{ uri: photo.uri }}
                style={styles.preview}
                resizeMode="contain"
              />
            )}
            <Text style={styles.label}>
              {isText ? 'Texte de la page' : 'Commentaire'}
            </Text>
            <TextInput
              style={[styles.input, isText && styles.inputText]}
              value={text}
              onChangeText={setText}
              placeholder={
                isText ? 'Écrivez le texte de cette page…' : 'Commentez ce moment…'
              }
              placeholderTextColor="#9ca3af"
              multiline
              // Correcteur natif iOS (= celui des SMS) : souligné rouge en
              // direct, tap-pour-corriger, autocorrection, barre de prédiction.
              // La langue suit le clavier actif de l'utilisateur (FR si clavier
              // français). Le bouton « Corriger » ci-dessous ajoute une passe FR
              // hors-ligne (grammaire/expressions) que le natif ne fait pas.
              autoCorrect
              spellCheck
              autoCapitalize="sentences"
              keyboardType="default"
            />
            <Pressable
              style={styles.spellBtn}
              onPress={runSpellCheck}
              disabled={checking || !text.trim()}
            >
              {checking ? (
                <ActivityIndicator color="#A64B24" size="small" />
              ) : (
                <Text
                  style={[
                    styles.spellText,
                    !text.trim() && styles.spellTextDisabled,
                  ]}
                >
                  ✓ Vérifier orthographe & grammaire
                </Text>
              )}
            </Pressable>
            {!isText && (
              <>
                <Text style={styles.label}>Lieu</Text>
                <TextInput
                  style={styles.inputLine}
                  value={place}
                  onChangeText={setPlace}
                  placeholder="Lieu de la prise de vue…"
                  placeholderTextColor="#9ca3af"
                  // Lieu = nom propre : on souligne les fautes (spellCheck) mais
                  // on n'autocorrige pas (éviter de déformer « Étretat » & co.).
                  autoCorrect={false}
                  spellCheck
                  autoCapitalize="words"
                />
              </>
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => photo && onSave(photo.id, text.trim(), place.trim())}
            >
              <Text style={styles.btnPrimaryText}>Enregistrer</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <SpellCheckModal
        visible={spellVisible}
        text={text}
        matches={matches}
        onApply={setText}
        onClose={() => setSpellVisible(false)}
      />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    // Laisse respirer le contenu : le panneau prend au plus 90 % de l'écran,
    // et la zone de saisie défile pour ne jamais couper la photo.
    maxHeight: '90%',
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    marginBottom: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    marginBottom: 4,
    backgroundColor: '#f3f4f6',
  },
  label: {
    fontFamily: F.monoBold,
    fontSize: 13,
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    fontFamily: F.mono,
    fontSize: 16,
    textAlignVertical: 'top',
    color: '#201B14',
  },
  inputText: { minHeight: 200 },
  inputLine: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: F.mono,
    fontSize: 16,
    color: '#201B14',
  },
  spellBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#EADDC4',
  },
  spellText: { fontFamily: F.monoBold, color: '#A64B24', fontSize: 14 },
  spellTextDisabled: { color: '#9ca3af' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
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
});

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
import { type ComponentType } from 'react';
import { F } from '../theme';
import { useLang } from '../i18n';
import type { Photo } from '../types';
import { checkSpelling, type SpellMatch } from '../spellcheck';
import { SpellCheckModal } from './SpellCheckModal';

// Reconnaissance vocale = module natif, **absent d'Expo Go**. Tout est en
// `require` protégé : un import statique de `./VoiceCommentButton` exécuterait
// `import 'expo-speech-recognition'` au chargement et planterait Expo Go. En Expo
// Go le require échoue → bouton non chargé, app stable. Sur un build EAS le
// module répond → le bouton apparaît.
//
// ⚠️ Ne **pas** conditionner à `isRecognitionAvailable()` ici : côté iOS il rend
// `SFSpeechRecognizer().isAvailable`, qui reste **faux tant que l'autorisation de
// reconnaissance vocale n'a pas été accordée**. Ce test tourne au chargement du
// module, donc avant toute demande — et son résultat est figé pour la session.
// On n'affichait alors jamais le bouton, donc on ne demandait jamais
// l'autorisation, donc le test restait faux (constaté sur TestFlight, build 5).
// La disponibilité réelle se vérifie au moment du clic, après la demande de
// permission, dans `VoiceCommentButton`.
let VoiceButton: ComponentType<{
  value: string;
  onChangeText: (t: string) => void;
}> | null = null;
try {
  const mod = require('expo-speech-recognition');
  if (typeof mod?.ExpoSpeechRecognitionModule?.start === 'function') {
    VoiceButton = require('./VoiceCommentButton').VoiceCommentButton;
  }
} catch {
  VoiceButton = null;
}

interface Props {
  /** Photo en cours d'édition, ou null si le modal est fermé. */
  photo: Photo | null;
  onSave: (id: string, comment: string, place: string) => void;
  onClose: () => void;
}

export function CommentModal({ photo, onSave, onClose }: Props) {
  const { L, lang } = useLang();
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [checking, setChecking] = useState(false);
  const [matches, setMatches] = useState<SpellMatch[]>([]);
  const [spellVisible, setSpellVisible] = useState(false);

  // Initialise le formulaire à l'OUVERTURE seulement (clé = id de la photo) :
  // ne pas dépendre de l'objet `photo` entier, sinon la résolution asynchrone du
  // lieu (qui recrée l'objet) réinitialiserait un commentaire en cours de frappe.
  useEffect(() => {
    setText(photo?.comment ?? '');
    setPlace(photo?.place ?? '');
  }, [photo?.id]);

  // Lieu résolu en arrière-plan (géocodage) après l'ouverture : le remplir s'il
  // arrive, mais sans écraser une saisie manuelle (on ne touche qu'un champ vide).
  useEffect(() => {
    if (photo?.place) setPlace((cur) => cur || photo.place || '');
  }, [photo?.place]);

  const runSpellCheck = async () => {
    if (!text.trim() || checking) return;
    setChecking(true);
    try {
      const found = await checkSpelling(text);
      if (found.length === 0) {
        Alert.alert(L.comment.spellTitle, L.comment.spellNone);
      } else {
        setMatches(found);
        setSpellVisible(true);
      }
    } catch {
      Alert.alert(
        L.comment.spellUnavailableTitle,
        L.comment.spellUnavailableBody,
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
              {isText ? L.comment.textLabel : L.comment.commentLabel}
            </Text>
            <TextInput
              style={[styles.input, isText && styles.inputText]}
              value={text}
              onChangeText={setText}
              placeholder={
                isText ? L.comment.textPlaceholder : L.comment.commentPlaceholder
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
            {VoiceButton && (
              <VoiceButton value={text} onChangeText={setText} />
            )}
            {/* Passe offline = index phonétique FR : proposée seulement en
                français. En anglais, le correcteur natif iOS suffit. */}
            {lang === 'fr' && (
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
                    {L.comment.checkButton}
                  </Text>
                )}
              </Pressable>
            )}
            {!isText && (
              <>
                <Text style={styles.label}>{L.comment.placeLabel}</Text>
                <TextInput
                  style={styles.inputLine}
                  value={place}
                  onChangeText={setPlace}
                  placeholder={L.comment.placePlaceholder}
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
              <Text style={styles.btnGhostText}>{L.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => photo && onSave(photo.id, text.trim(), place.trim())}
            >
              <Text style={styles.btnPrimaryText}>{L.common.save}</Text>
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

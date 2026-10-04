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
import { MaterialIcons } from '@expo/vector-icons';
import { F } from '../theme';
import { hasMarks, toggleMark, type Selection } from '../richText';
import { RichText } from './RichText';
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
  // Sélection courante du champ + sélection à réimposer après une mise en forme
  // (sans quoi le curseur retomberait à la fin du texte après chaque bouton).
  // Vrai pendant la saisie. Hors saisie, un commentaire mis en forme est affiché
  // **rendu** (et non avec ses balises) : une seule zone de texte à l'écran,
  // jamais le champ et un aperçu côte à côte.
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<Selection>({ start: 0, end: 0 });
  const [forceSel, setForceSel] = useState<Selection | undefined>();
  // ⚠️ iOS ANNULE la sélection avant que le bouton de mise en forme ne réagisse :
  // le champ signale une sélection vide en perdant le focus, et le menu natif
  // (Couper/Copier/Coller) mange le premier appui. On retenait alors « rien de
  // sélectionné » et la marque partait sur tout le texte. D'où cette mémoire de
  // la dernière plage réellement sélectionnée, remise à zéro dès que le texte
  // change (les offsets ne voudraient plus rien dire). En état (et non en ref) :
  // la barre annonce sa cible, ce qui lève toute ambiguïté pour l'utilisateur.
  const [remembered, setRemembered] = useState<Selection | null>(null);
  const [matches, setMatches] = useState<SpellMatch[]>([]);
  const [spellVisible, setSpellVisible] = useState(false);

  // Initialise le formulaire à l'OUVERTURE seulement (clé = id de la photo) :
  // ne pas dépendre de l'objet `photo` entier, sinon la résolution asynchrone du
  // lieu (qui recrée l'objet) réinitialiserait un commentaire en cours de frappe.
  useEffect(() => {
    setText(photo?.comment ?? '');
    setPlace(photo?.place ?? '');
    setSel({ start: 0, end: 0 });
    setForceSel(undefined);
    setRemembered(null);
    setEditing(false);
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

  // Gras / souligné : les marques (**…** / __…__) vivent dans le texte lui-même
  // (cf. `src/richText.ts`). Le champ les montre telles quelles — React Native
  // ne sait pas afficher une graisse partielle dans un `TextInput` — et
  // l'aperçu juste en dessous donne le rendu réel.
  // Plage que les boutons vont mettre en forme : la sélection du champ si elle
  // tient encore, sinon la dernière mémorisée. `null` = tout le commentaire.
  const target =
    sel.end > sel.start
      ? sel
      : remembered && remembered.end <= text.length
        ? remembered
        : null;

  const applyMark = (mark: 'bold' | 'underline') => {
    const next = toggleMark(text, target ?? sel, mark);
    setText(next.text);
    setSel(next.selection);
    setForceSel(next.selection);
    // La plage marquée reste la cible : enchaîner gras puis souligné sur le même
    // mot doit marcher, et le champ la montre encore sélectionnée.
    setRemembered(next.selection);
  };
  // Le texte rendu remplace le champ **seulement** s'il y a de la mise en forme
  // à montrer et qu'on n'est pas en train de taper : sans marque, rien ne change
  // pour qui n'utilise pas les boutons B/U.
  const showRendered = !isText && !editing && hasMarks(text);

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
            {/* Mise en forme : réservée au commentaire d'une photo (les pages de
                texte gardent un rendu uniforme). La barre est AU-DESSUS du champ :
                le menu natif d'iOS s'ouvre sous le mot sélectionné et recouvrait
                les boutons placés en dessous. */}
            {!isText && (
              <View style={styles.formatRow}>
                <Pressable
                  style={styles.formatBtn}
                  // `onPressIn` et non `onPress` : l'appui-bas précède la perte
                  // de focus du champ, donc la sélection est encore vivante.
                  onPressIn={() => applyMark('bold')}
                  accessibilityRole="button"
                  accessibilityLabel={L.comment.boldLabel}
                >
                  <MaterialIcons name="format-bold" size={22} color="#A64B24" />
                </Pressable>
                <Pressable
                  style={styles.formatBtn}
                  onPressIn={() => applyMark('underline')}
                  accessibilityRole="button"
                  accessibilityLabel={L.comment.underlineLabel}
                >
                  <MaterialIcons
                    name="format-underlined"
                    size={22}
                    color="#A64B24"
                  />
                </Pressable>
                <Text style={styles.formatHint} numberOfLines={2}>
                  {target ? L.comment.formatSelection : L.comment.formatAll}
                </Text>
              </View>
            )}
            {showRendered ? (
              // Commentaire mis en forme, hors saisie : on montre le texte
              // DÉFINITIF (gras/souligné rendus, balises invisibles). Toucher
              // la zone repasse en saisie, là où les balises sont nécessaires.
              <Pressable
                style={[styles.input, styles.rendered]}
                onPress={() => setEditing(true)}
                accessibilityRole="button"
                accessibilityLabel={L.comment.tapToEdit}
              >
                <RichText text={text} style={styles.renderedText} />
                <Text style={styles.renderedHint}>{L.comment.tapToEdit}</Text>
              </Pressable>
            ) : (
            <TextInput
              style={[styles.input, isText && styles.inputText]}
              autoFocus={editing}
              onFocus={() => setEditing(true)}
              // Fin de saisie → retour au texte rendu (cf. `showRendered`).
              onBlur={() => setEditing(false)}
              value={text}
              onChangeText={(t) => {
                setForceSel(undefined);
                setRemembered(null);
                setText(t);
              }}
              selection={forceSel}
              onSelectionChange={(e) => {
                const next = e.nativeEvent.selection;
                setSel(next);
                // Seules les plages NON vides sont mémorisées : le signal de
                // sélection vide émis à la perte du focus ne doit pas l'effacer.
                if (next.end > next.start) setRemembered(next);
                setForceSel(undefined);
              }}
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
            )}
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
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  formatBtn: {
    width: 42,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EADDC4',
  },
  formatHint: { flex: 1, fontFamily: F.mono, fontSize: 12, color: '#9ca3af' },
  // Même gabarit que `input` (bordure, rayon, hauteur) : passer de la lecture à
  // la saisie ne doit pas faire sauter la mise en page.
  rendered: { justifyContent: 'space-between', backgroundColor: '#faf7f1' },
  renderedText: { fontFamily: F.mono, fontSize: 16, color: '#201B14' },
  renderedHint: {
    fontFamily: F.mono,
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 10,
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

import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { C, F } from '../theme';
import { localeTag, useLang } from '../i18n';
import { applySpokenPunctuation } from '../dictation';

interface Props {
  /** Texte courant du commentaire (base à laquelle la dictée s'ajoute). */
  value: string;
  /** Met à jour le texte du commentaire (dictée en direct). */
  onChangeText: (text: string) => void;
}

/**
 * Bouton micro : dicte un commentaire par reconnaissance vocale **on-device**
 * (iOS `SFSpeechRecognizer`), dans la langue courante de l'app. La dictée
 * s'**ajoute** au texte existant (elle ne l'écrase pas) ; les résultats partiels
 * s'affichent en direct, chaque phrase finale est figée.
 *
 * ⚠️ Module **natif** : ce composant n'est monté que si la reconnaissance est
 * disponible (cf. `CommentModal`), donc jamais dans Expo Go — les hooks ci-dessous
 * ne s'exécutent que sur un build EAS / TestFlight.
 */
export function VoiceCommentButton({ value, onChangeText }: Props) {
  const { L, lang } = useLang();
  const [recording, setRecording] = useState(false);
  // Miroir de `recording` lisible depuis les écouteurs : ceux-ci sont **globaux**
  // (ils reçoivent toute session de reconnaissance, pas seulement la nôtre).
  const recordingRef = useRef(false);
  // Texte présent avant/au fil de la dictée : chaque phrase finale s'y ajoute,
  // les résultats partiels sont recomposés par-dessus sans le perdre.
  const baseRef = useRef('');
  // Dernier texte écrit par la dictée. Si le champ change autrement (l'utilisateur
  // corrige au clavier pendant l'écoute), on arrête : le résultat suivant aurait
  // réécrit le commentaire à partir de l'ancien texte, et le passage effacé
  // revenait à l'enregistrement.
  const writtenRef = useRef<string | null>(null);

  const setRec = (on: boolean) => {
    recordingRef.current = on;
    setRecording(on);
  };

  // Fermer l'éditeur sans appuyer sur stop laissait la session tourner
  // (`continuous: true`) : le bouton suivant se rebranchait dessus et le
  // commentaire se remplissait tout seul. On coupe donc au démontage.
  useEffect(
    () => () => {
      recordingRef.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Session déjà close : rien à couper.
      }
    },
    [],
  );

  // Correction au clavier pendant l'écoute : fin de la dictée, le texte corrigé
  // fait foi (cf. `writtenRef`).
  useEffect(() => {
    if (!recordingRef.current || writtenRef.current === null) return;
    if (value !== writtenRef.current) {
      recordingRef.current = false;
      setRecording(false);
      writtenRef.current = null;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // déjà close
      }
    }
  }, [value]);

  useSpeechRecognitionEvent('result', (e) => {
    // Le bouton est le seul déclencheur : hors enregistrement demandé, tout
    // résultat vient d'une session résiduelle et ne doit pas écrire dans le champ.
    if (!recordingRef.current) return;
    const transcript = e.results[0]?.transcript ?? '';
    if (!transcript) return;
    const base = baseRef.current;
    // Ponctuation dite à voix haute (« point », « virgule »…) : une pause ne
    // coupe plus la phrase. Au milieu d'une phrase, pas de majuscule ajoutée.
    let spoken = applySpokenPunctuation(transcript, lang);
    const sentenceStart = !base || /[.!?…]\s*$|\n$/.test(base);
    if (!sentenceStart && /^[a-zà-öø-ÿœ]/.test(transcript)) {
      spoken = spoken.charAt(0).toLowerCase() + spoken.slice(1);
    }
    const joined = !base ? spoken : base.endsWith('\n') ? base + spoken : `${base} ${spoken}`;
    writtenRef.current = joined;
    onChangeText(joined);
    if (e.isFinal) baseRef.current = joined;
  });

  useSpeechRecognitionEvent('end', () => setRec(false));

  useSpeechRecognitionEvent('error', (e) => {
    setRec(false);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      Alert.alert(L.comment.micDeniedTitle, L.comment.micDeniedBody);
      return;
    }
    // Autre échec = le plus souvent le modèle hors ligne de la langue courante
    // n'est pas installé sur l'iPhone (`requiresOnDeviceRecognition`). Sans ce
    // message, l'appui sur le micro ne produisait rien de visible.
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      Alert.alert(L.comment.micFailedTitle, L.comment.micFailedBody);
    }
  });

  const stop = () => {
    ExpoSpeechRecognitionModule.stop();
    setRec(false);
    writtenRef.current = null;
  };

  const start = async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(L.comment.micDeniedTitle, L.comment.micDeniedBody);
      return;
    }
    baseRef.current = value.trim();
    writtenRef.current = value;
    setRec(true);
    ExpoSpeechRecognitionModule.start({
      lang: localeTag(lang),
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      // Pas de ponctuation automatique (un point à chaque pause) : on ponctue
      // à la voix (cf. `applySpokenPunctuation`).
      addsPunctuation: false,
    });
  };

  return (
    <Pressable
      style={[styles.btn, recording && styles.btnRecording]}
      onPress={recording ? stop : start}
      hitSlop={8}
    >
      <Ionicons
        name={recording ? 'stop' : 'mic'}
        size={16}
        color={recording ? '#fff' : C.sienna}
      />
      {recording ? (
        <View style={styles.pulseRow}>
          <View style={styles.dot} />
          <Text style={styles.recText}>{L.comment.listening}</Text>
        </View>
      ) : (
        <Text style={styles.label}>{L.comment.dictate}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.tan,
  },
  btnRecording: { backgroundColor: C.sienna },
  label: { fontFamily: F.monoBold, color: C.sienna, fontSize: 14 },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recText: { fontFamily: F.monoBold, color: '#fff', fontSize: 14 },
});

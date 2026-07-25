import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { C, F } from '../theme';
import { localeTag, useLang } from '../i18n';

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
  // Texte présent avant/au fil de la dictée : chaque phrase finale s'y ajoute,
  // les résultats partiels sont recomposés par-dessus sans le perdre.
  const baseRef = useRef('');

  useSpeechRecognitionEvent('result', (e) => {
    const transcript = e.results[0]?.transcript ?? '';
    if (!transcript) return;
    const base = baseRef.current;
    const joined = base ? `${base} ${transcript}` : transcript;
    onChangeText(joined);
    if (e.isFinal) baseRef.current = joined;
  });

  useSpeechRecognitionEvent('end', () => setRecording(false));

  useSpeechRecognitionEvent('error', (e) => {
    setRecording(false);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      Alert.alert(L.comment.micDeniedTitle, L.comment.micDeniedBody);
    }
  });

  const stop = () => {
    ExpoSpeechRecognitionModule.stop();
    setRecording(false);
  };

  const start = async () => {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(L.comment.micDeniedTitle, L.comment.micDeniedBody);
      return;
    }
    baseRef.current = value.trim();
    setRecording(true);
    ExpoSpeechRecognitionModule.start({
      lang: localeTag(lang),
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
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

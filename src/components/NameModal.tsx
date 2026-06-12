import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  /** Titre affiché en haut du modal (ex. « Nouveau dossier »). */
  title: string;
  /** Valeur initiale du champ (vide pour une création). */
  initialValue: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/** Modal de saisie du nom d'un dossier (création ou renommage). */
export function NameModal({
  visible,
  title,
  initialValue,
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const [text, setText] = useState(initialValue);

  // Réinitialise le champ à chaque ouverture.
  useEffect(() => {
    if (visible) setText(initialValue);
  }, [visible, initialValue]);

  const name = text.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Nom du dossier"
            placeholderTextColor="#9ca3af"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => name && onSubmit(name)}
          />
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, !name && styles.btnDisabled]}
              disabled={!name}
              onPress={() => onSubmit(name)}
            >
              <Text style={styles.btnPrimaryText}>{submitLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1c1c1e',
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1c1c1e',
  },
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
  btnGhostText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#2563eb' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});

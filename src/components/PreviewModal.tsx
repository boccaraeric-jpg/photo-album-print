import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { F } from '../theme';
import { useLang } from '../i18n';

interface Props {
  visible: boolean;
  /** HTML complet du mini album (identique au futur PDF). */
  html: string | null;
  /** Vrai pendant la génération/partage du fichier final. */
  sending: boolean;
  /** Libellé du bouton d'envoi (« Partager l'album » ou « Envoyer »). */
  sendLabel: string;
  /** Revenir à l'album pour en modifier le contenu (photos, ordre, textes). */
  onBackToAlbum: () => void;
  /** Revenir aux options de mise en page. */
  onEditLayout: () => void;
  /** Ouvrir le choix du format et envoyer. */
  onSend: () => void;
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
  onBackToAlbum,
  onEditLayout,
  onSend,
}: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBackToAlbum}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable hitSlop={10} onPress={onBackToAlbum} disabled={sending}>
            <Text style={styles.backLink}>{L.preview.editAlbum}</Text>
          </Pressable>
          <Text style={styles.title}>{L.preview.title}</Text>
          <Text style={styles.subtitle}>{L.preview.subtitle}</Text>
        </View>

        <View style={styles.webWrap}>
          {html ? (
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={styles.web}
              scrollEnabled
              showsVerticalScrollIndicator
            />
          ) : (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#A64B24" />
            </View>
          )}
        </View>

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
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>{sendLabel} →</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
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
});

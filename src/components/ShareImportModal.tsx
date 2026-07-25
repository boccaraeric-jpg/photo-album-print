import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Album } from '../types';
import { C, F } from '../theme';
import { useLang } from '../i18n';
import { NameModal } from './NameModal';

interface Props {
  /** Nombre de photos partagées à importer (pour le titre). */
  count: number;
  albums: Album[];
  /** Compte de photos par dossier (pour l'aperçu). */
  photoCountOf: (albumId: string) => number;
  /** Nom pré-rempli du nouveau dossier (ex. nom de l'album reçu d'un ami). */
  defaultName?: string;
  /** Importer dans un dossier existant. */
  onPick: (albumId: string) => void;
  /** Créer un dossier puis y importer. */
  onCreate: (name: string) => void;
  onCancel: () => void;
}

/**
 * Destination d'une ou plusieurs photos reçues via le **partage système**
 * (feuille de partage iOS / intent Android → ComClic). Liste les dossiers
 * existants et propose d'en créer un nouveau. Toujours présenté au premier plan
 * quand un partage arrive (cf. `Root`).
 */
export function ShareImportModal({
  count,
  albums,
  photoCountOf,
  defaultName,
  onPick,
  onCreate,
  onCancel,
}: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>{L.shareImport.title(count)}</Text>
        <Text style={styles.hint}>{L.shareImport.hint}</Text>

        <FlatList
          data={albums}
          keyExtractor={(a) => a.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPick(item.id)}>
              <Text style={styles.rowIcon}>📁</Text>
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name.trim() || L.album.noName}
                </Text>
                <Text style={styles.rowCount}>
                  {L.album.photoCount(photoCountOf(item.id))}
                </Text>
              </View>
              <Text style={styles.rowChevron}>›</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable
              style={styles.newBtn}
              onPress={() => setCreating(true)}
            >
              <Text style={styles.newBtnText}>{L.shareImport.newFolder}</Text>
            </Pressable>
          }
        />

        <Pressable
          style={[styles.cancel, { marginBottom: insets.bottom + 12 }]}
          onPress={onCancel}
        >
          <Text style={styles.cancelText}>{L.common.cancel}</Text>
        </Pressable>

        <NameModal
          visible={creating}
          title={L.home.createTitle}
          initialValue={defaultName ?? ''}
          submitLabel={L.home.createSubmit}
          onSubmit={(name) => {
            setCreating(false);
            onCreate(name);
          }}
          onClose={() => setCreating(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 20 },
  title: { fontFamily: F.display, fontSize: 26, color: C.ink },
  hint: {
    fontFamily: F.mono,
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
    marginBottom: 12,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  rowIcon: { fontSize: 22 },
  rowBody: { flex: 1 },
  rowName: { fontFamily: F.monoBold, fontSize: 16, color: C.ink },
  rowCount: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginTop: 2 },
  rowChevron: { fontFamily: F.monoBold, fontSize: 22, color: C.sienna },
  newBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.sienna,
  },
  newBtnText: {
    fontFamily: F.monoBold,
    fontSize: 15,
    color: C.sienna,
    letterSpacing: 0.5,
  },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontFamily: F.monoBold, fontSize: 15, color: C.muted },
});

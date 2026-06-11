import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

import type { Adjustments, Photo } from './src/types';
import {
  loadPhotos,
  loadTitle,
  savePhotos,
  saveTitle,
} from './src/storage';
import { deleteImage, persistImage } from './src/photoFiles';
import { saveToPhotoLibrary } from './src/mediaLibrary';
import { bakeAdjustedImage, isNeutral } from './src/adjustments';
import { exportAlbumPdf } from './src/pdf';
import { PhotoCard } from './src/components/PhotoCard';
import { CommentModal } from './src/components/CommentModal';
import { AdjustModal } from './src/components/AdjustModal';

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AlbumScreen />
    </SafeAreaProvider>
  );
}

function AlbumScreen() {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState('Mon album');
  const [editing, setEditing] = useState<Photo | null>(null);
  const [adjusting, setAdjusting] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Chargement initial depuis le stockage persistant.
  useEffect(() => {
    (async () => {
      const [storedPhotos, storedTitle] = await Promise.all([
        loadPhotos(),
        loadTitle(),
      ]);
      setPhotos(storedPhotos);
      setTitle(storedTitle);
      setLoading(false);
    })();
  }, []);

  // Persiste les photos à chaque modification (après le chargement initial).
  useEffect(() => {
    if (!loading) savePhotos(photos);
  }, [photos, loading]);

  const updateTitle = useCallback((value: string) => {
    setTitle(value);
    saveTitle(value);
  }, []);

  const addAsset = useCallback(async (uri: string, openEditor: boolean) => {
    const id = newId();
    try {
      const persisted = await persistImage(uri, id);
      const photo: Photo = {
        id,
        uri: persisted,
        comment: '',
        createdAt: Date.now(),
      };
      setPhotos((prev) => [...prev, photo]);
      if (openEditor) setEditing(photo);
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer la photo.");
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission requise',
        "Autorise l'accès à l'appareil photo dans les réglages pour prendre des photos.",
      );
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      const uri = res.assets[0].uri;
      // Enregistre d'abord la photo dans la photothèque du téléphone
      // (sans commentaire), pour la conserver en dehors de l'album.
      try {
        const saved = await saveToPhotoLibrary(uri);
        if (!saved) {
          Alert.alert(
            'Photo non ajoutée à Photos',
            "La photo est bien dans l'album, mais autorise l'ajout à la photothèque dans les réglages pour la conserver aussi dans Photos.",
          );
        }
      } catch {
        // L'échec d'enregistrement dans Photos ne doit pas bloquer l'album.
      }
      await addAsset(uri, true);
    }
  }, [addAsset]);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission requise',
        "Autorise l'accès à la galerie dans les réglages pour importer des photos.",
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!res.canceled) {
      // Une seule photo → ouvre l'éditeur de commentaire ; plusieurs → ajout direct.
      const openEditor = res.assets.length === 1;
      for (const asset of res.assets) {
        await addAsset(asset.uri, openEditor);
      }
    }
  }, [addAsset]);

  const saveComment = useCallback((id: string, comment: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, comment } : p)),
    );
    setEditing(null);
  }, []);

  const saveAdjustments = useCallback(
    async (photo: Photo, adjustments: Adjustments) => {
      const originalUri = photo.originalUri ?? photo.uri;
      try {
        const neutral = isNeutral(adjustments);
        const newUri = neutral
          ? originalUri
          : await bakeAdjustedImage(originalUri, adjustments, photo.id);
        // Supprime l'ancienne version ajustée devenue obsolète.
        if (photo.uri !== originalUri) await deleteImage(photo.uri);
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id
              ? {
                  ...p,
                  uri: newUri,
                  originalUri: neutral ? undefined : originalUri,
                  adjustments: neutral ? undefined : adjustments,
                }
              : p,
          ),
        );
        setAdjusting(null);
      } catch {
        Alert.alert('Erreur', "Impossible d'appliquer les réglages.");
      }
    },
    [],
  );

  const removePhoto = useCallback((photo: Photo) => {
    Alert.alert('Supprimer cette photo ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
          deleteImage(photo.uri);
          if (photo.originalUri && photo.originalUri !== photo.uri) {
            deleteImage(photo.originalUri);
          }
        },
      },
    ]);
  }, []);

  const exportAlbum = useCallback(async () => {
    if (photos.length === 0) return;
    setExporting(true);
    try {
      await exportAlbumPdf(photos, title.trim() || 'Mon album');
    } catch {
      Alert.alert('Erreur', 'La génération du PDF a échoué.');
    } finally {
      setExporting(false);
    }
  }, [photos, title]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.kicker}>ALBUM PHOTO</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={updateTitle}
          placeholder="Titre de l'album"
          placeholderTextColor="#9ca3af"
        />
        <Text style={styles.count}>
          {photos.length} photo{photos.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <PhotoCard
            photo={item}
            onEdit={setEditing}
            onAdjust={setAdjusting}
            onDelete={removePhoto}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aucune photo</Text>
            <Text style={styles.emptyText}>
              Prends une photo ou importe-en depuis ta galerie, puis ajoute un
              commentaire à chacune.
            </Text>
          </View>
        }
      />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[
            styles.btn,
            styles.btnPrimary,
            (photos.length === 0 || exporting) && styles.btnDisabled,
          ]}
          onPress={exportAlbum}
          disabled={photos.length === 0 || exporting}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Exporter l'album (PDF) →</Text>
          )}
        </Pressable>
        <View style={styles.row}>
          <Pressable
            style={[styles.btn, styles.rowBtn, styles.btnLight]}
            onPress={takePhoto}
          >
            <Text style={styles.btnLightText}>📷  Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.rowBtn, styles.btnLight]}
            onPress={pickFromLibrary}
          >
            <Text style={styles.btnLightText}>🖼  Galerie</Text>
          </Pressable>
        </View>
      </View>

      <CommentModal
        photo={editing}
        onSave={saveComment}
        onClose={() => setEditing(null)}
      />

      <AdjustModal
        photo={adjusting}
        onSave={saveAdjustments}
        onClose={() => setAdjusting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1c1e',
    paddingVertical: 2,
  },
  count: { fontSize: 14, color: '#6b7280' },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 21,
  },
  toolbar: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    flexShrink: 0,
  },
  row: { flexDirection: 'row', gap: 12 },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  rowBtn: { flex: 1 },
  btnLight: { backgroundColor: '#eef2ff' },
  btnLightText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#2563eb' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});

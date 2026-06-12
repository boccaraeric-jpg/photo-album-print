import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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

import type { Adjustments, Album, ExportOptions, Photo } from './src/types';
import {
  loadData,
  loadExportOptions,
  saveAlbums,
  saveExportOptions,
  savePhotos,
} from './src/storage';
import { newId } from './src/id';
import { deleteImage, persistImage } from './src/photoFiles';
import { saveToPhotoLibrary } from './src/mediaLibrary';
import { bakeAdjustedImage, isNeutral } from './src/adjustments';
import { DEFAULT_EXPORT_OPTIONS, exportAlbumPdf } from './src/pdf';
import { PhotoCard } from './src/components/PhotoCard';
import { AlbumCard } from './src/components/AlbumCard';
import { CommentModal } from './src/components/CommentModal';
import { AdjustModal } from './src/components/AdjustModal';
import { NameModal } from './src/components/NameModal';
import { ExportModal } from './src/components/ExportModal';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);

  // Chargement initial depuis le stockage persistant.
  useEffect(() => {
    (async () => {
      const data = await loadData();
      setAlbums(data.albums);
      setPhotos(data.photos);
      setLoading(false);
    })();
  }, []);

  // Persiste dossiers et photos à chaque modification (après le chargement initial).
  useEffect(() => {
    if (!loading) savePhotos(photos);
  }, [photos, loading]);
  useEffect(() => {
    if (!loading) saveAlbums(albums);
  }, [albums, loading]);

  const createAlbum = useCallback((name: string) => {
    const album: Album = { id: newId(), name, createdAt: Date.now() };
    setAlbums((prev) => [...prev, album]);
    setOpenAlbumId(album.id);
  }, []);

  const renameAlbum = useCallback((id: string, name: string) => {
    setAlbums((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
  }, []);

  const setAlbumCover = useCallback((id: string, photoId: string) => {
    setAlbums((prev) =>
      prev.map((a) => (a.id === id ? { ...a, coverPhotoId: photoId } : a)),
    );
  }, []);

  const deleteAlbum = useCallback(
    (album: Album) => {
      Alert.alert(
        `Supprimer « ${album.name.trim() || 'Sans nom'} » ?`,
        'Les photos de ce dossier seront retirées de l’app (mais pas de votre photothèque).',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () => {
              for (const p of photos) {
                if (p.albumId !== album.id) continue;
                deleteImage(p.uri);
                if (p.originalUri && p.originalUri !== p.uri) {
                  deleteImage(p.originalUri);
                }
              }
              setPhotos((prev) => prev.filter((p) => p.albumId !== album.id));
              setAlbums((prev) => prev.filter((a) => a.id !== album.id));
            },
          },
        ],
      );
    },
    [photos],
  );

  const openAlbum = albums.find((a) => a.id === openAlbumId) ?? null;

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (openAlbum) {
    return (
      <AlbumScreen
        album={openAlbum}
        photos={photos.filter((p) => p.albumId === openAlbum.id)}
        setPhotos={setPhotos}
        onRename={(name) => renameAlbum(openAlbum.id, name)}
        onSetCover={(photoId) => setAlbumCover(openAlbum.id, photoId)}
        onBack={() => setOpenAlbumId(null)}
      />
    );
  }

  return (
    <HomeScreen
      albums={albums}
      photos={photos}
      onOpen={(album) => setOpenAlbumId(album.id)}
      onCreate={createAlbum}
      onRename={renameAlbum}
      onDelete={deleteAlbum}
    />
  );
}

interface HomeProps {
  albums: Album[];
  photos: Photo[];
  onOpen: (album: Album) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (album: Album) => void;
}

function HomeScreen({
  albums,
  photos,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: HomeProps) {
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Album | null>(null);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.kicker}>ALBUM PHOTO</Text>
        <Text style={styles.homeTitle}>Mes dossiers</Text>
        <Text style={styles.count}>
          {albums.length} dossier{albums.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={albums}
        keyExtractor={(a) => a.id}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const albumPhotos = photos.filter((p) => p.albumId === item.id);
          const cover =
            albumPhotos.find((p) => p.id === item.coverPhotoId) ??
            albumPhotos[0];
          return (
            <AlbumCard
              album={item}
              count={albumPhotos.length}
              thumbUri={cover?.uri}
              onOpen={onOpen}
              onRename={setRenaming}
              onDelete={onDelete}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aucun dossier</Text>
            <Text style={styles.emptyText}>
              Crée un dossier pour classer tes photos, puis exporte chaque
              dossier en PDF à imprimer.
            </Text>
          </View>
        }
      />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => setCreating(true)}
        >
          <Text style={styles.btnPrimaryText}>＋  Nouveau dossier</Text>
        </Pressable>
      </View>

      <NameModal
        visible={creating}
        title="Nouveau dossier"
        initialValue=""
        submitLabel="Créer"
        onSubmit={(name) => {
          setCreating(false);
          onCreate(name);
        }}
        onClose={() => setCreating(false)}
      />

      <NameModal
        visible={renaming !== null}
        title="Renommer le dossier"
        initialValue={renaming?.name ?? ''}
        submitLabel="Renommer"
        onSubmit={(name) => {
          if (renaming) onRename(renaming.id, name);
          setRenaming(null);
        }}
        onClose={() => setRenaming(null)}
      />
    </View>
  );
}

interface AlbumProps {
  album: Album;
  /** Photos du dossier ouvert uniquement. */
  photos: Photo[];
  /** Mise à jour de la liste globale des photos (tous dossiers). */
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
  onRename: (name: string) => void;
  onSetCover: (photoId: string) => void;
  onBack: () => void;
}

function AlbumScreen({
  album,
  photos,
  setPhotos,
  onRename,
  onSetCover,
  onBack,
}: AlbumProps) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<Photo | null>(null);
  const [adjusting, setAdjusting] = useState<Photo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(
    DEFAULT_EXPORT_OPTIONS,
  );

  // Repart des dernières options d'export choisies.
  useEffect(() => {
    loadExportOptions().then((stored) => {
      if (stored) setExportOptions(stored);
    });
  }, []);

  // Bouton retour Android : revient à la liste des dossiers.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const addAsset = useCallback(
    async (uri: string, openEditor: boolean) => {
      const id = newId();
      try {
        const persisted = await persistImage(uri, id);
        const photo: Photo = {
          id,
          albumId: album.id,
          uri: persisted,
          comment: '',
          createdAt: Date.now(),
        };
        setPhotos((prev) => [...prev, photo]);
        if (openEditor) setEditing(photo);
      } catch {
        Alert.alert('Erreur', "Impossible d'enregistrer la photo.");
      }
    },
    [album.id, setPhotos],
  );

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

  const saveComment = useCallback(
    (id: string, comment: string) => {
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, comment } : p)),
      );
      setEditing(null);
    },
    [setPhotos],
  );

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
    [setPhotos],
  );

  const removePhoto = useCallback(
    (photo: Photo) => {
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
    },
    [setPhotos],
  );

  const exportAlbum = useCallback(
    async (options: ExportOptions) => {
      if (photos.length === 0) return;
      setExporting(true);
      try {
        setExportOptions(options);
        saveExportOptions(options);
        await exportAlbumPdf(
          photos,
          album.name.trim() || 'Mon album',
          options,
          album.coverPhotoId,
        );
        setExportVisible(false);
      } catch {
        Alert.alert('Erreur', 'La génération du PDF a échoué.');
      } finally {
        setExporting(false);
      }
    },
    [photos, album.name],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} onPress={onBack}>
          <Text style={styles.backLink}>‹ Dossiers</Text>
        </Pressable>
        <TextInput
          style={styles.titleInput}
          value={album.name}
          onChangeText={onRename}
          placeholder="Nom du dossier"
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
            isCover={item.id === (album.coverPhotoId ?? photos[0]?.id)}
            onEdit={setEditing}
            onSetCover={(photo) => onSetCover(photo.id)}
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
            photos.length === 0 && styles.btnDisabled,
          ]}
          onPress={() => setExportVisible(true)}
          disabled={photos.length === 0}
        >
          <Text style={styles.btnPrimaryText}>Exporter ce dossier (PDF) →</Text>
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

      <ExportModal
        visible={exportVisible}
        initial={exportOptions}
        exporting={exporting}
        onExport={exportAlbum}
        onClose={() => setExportVisible(false)}
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
  backLink: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 2,
  },
  homeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1c1e',
    paddingVertical: 2,
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

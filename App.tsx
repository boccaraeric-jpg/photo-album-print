import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';

import { C, F } from './src/theme';

import type { Adjustments, Album, ExportOptions, Photo } from './src/types';
import {
  comparePhotos,
  loadData,
  loadExportOptions,
  saveAlbums,
  saveExportOptions,
  savePhotos,
} from './src/storage';
import { newId } from './src/id';
import { extractTakenAt } from './src/exif';
import { getCurrentCoords, resolveCoords } from './src/photoLocation';
import { reverseGeocode } from './src/geocode';
import { deleteImage, persistImage } from './src/photoFiles';
import { saveToPhotoLibrary } from './src/mediaLibrary';
import { zipImages, zipPhotos } from './src/albumZip';
import { bakeAdjustedImage, isNeutral } from './src/adjustments';
import {
  buildAlbumHtml,
  DEFAULT_EXPORT_OPTIONS,
  htmlToPdfFile,
  shareFile,
} from './src/pdf';
import { buildAlbumImages } from './src/pageImages';
import { PhotoCard } from './src/components/PhotoCard';
import { AlbumCard } from './src/components/AlbumCard';
import { CommentModal } from './src/components/CommentModal';
import { AdjustModal } from './src/components/AdjustModal';
import { NameModal } from './src/components/NameModal';
import { ExportModal } from './src/components/ExportModal';
import { PreviewModal } from './src/components/PreviewModal';
import { CropModal } from './src/components/CropModal';
import { WelcomeScreen } from './src/components/WelcomeScreen';

export default function App() {
  const [fontsLoaded] = useFonts({
    Montserrat: require('./assets/fonts/Montserrat-Medium.ttf'),
    MontserratBold: require('./assets/fonts/Montserrat-Bold.ttf'),
    MontserratExtraBold: require('./assets/fonts/Montserrat-ExtraBold.ttf'),
  });
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: C.paper }} />;
  }
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
  const [showWelcome, setShowWelcome] = useState(true);

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

  if (showWelcome) {
    return <WelcomeScreen onEnter={() => setShowWelcome(false)} />;
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color="#A64B24" />
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
  const [cropping, setCropping] = useState<Photo | null>(null);
  const [exportVisible, setExportVisible] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(
    DEFAULT_EXPORT_OPTIONS,
  );

  // Photos du dossier triées selon l'ordre manuel (glisser-déposer).
  const orderedPhotos = useMemo(
    () => [...photos].sort(comparePhotos),
    [photos],
  );
  const defaultCoverId =
    album.coverPhotoId ?? orderedPhotos.find((p) => p.kind !== 'text')?.id;

  // Repart des dernières options d'export choisies (fusionnées aux défauts
  // pour absorber les nouveaux réglages absents des anciennes sauvegardes).
  useEffect(() => {
    loadExportOptions().then((stored) => {
      if (stored) setExportOptions({ ...DEFAULT_EXPORT_OPTIONS, ...stored });
    });
  }, []);

  // Réordonne en échangeant une photo avec sa voisine (boutons ↑/↓), puis
  // réattribue un rang contigu à toutes les photos du dossier.
  const movePhoto = useCallback(
    (photoId: string, direction: 'up' | 'down') => {
      const arr = [...orderedPhotos];
      const i = arr.findIndex((p) => p.id === photoId);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const rankById = new Map(arr.map((p, idx) => [p.id, idx]));
      setPhotos((prev) =>
        prev.map((p) =>
          rankById.has(p.id) ? { ...p, order: rankById.get(p.id)! } : p,
        ),
      );
    },
    [orderedPhotos, setPhotos],
  );

  // Bouton retour Android : revient à la liste des dossiers.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const addAsset = useCallback(
    async (
      uri: string,
      openEditor: boolean,
      takenAt?: number,
      coords?: { lat: number; lon: number },
    ) => {
      const id = newId();
      try {
        const persisted = await persistImage(uri, id);
        // `order` laissé indéfini : la comparaison place les nouvelles photos en
        // fin de dossier (puis le chargement leur attribue un rang contigu).
        const photo: Photo = {
          id,
          albumId: album.id,
          uri: persisted,
          comment: '',
          createdAt: Date.now(),
          takenAt,
          coords,
        };
        setPhotos((prev) => [...prev, photo]);
        if (openEditor) setEditing(photo);
        // Géocodage inverse best-effort en arrière-plan : renseigne le lieu
        // sans bloquer l'import (l'utilisateur peut le corriger à la main).
        if (coords) {
          reverseGeocode(coords).then((place) => {
            if (place) {
              setPhotos((prev) =>
                prev.map((p) => (p.id === id ? { ...p, place } : p)),
              );
            }
          });
        }
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
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8, exif: true });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      // Enregistre d'abord la photo dans la photothèque du téléphone
      // (sans commentaire), pour la conserver en dehors de l'album.
      try {
        const saved = await saveToPhotoLibrary(asset.uri);
        if (!saved) {
          Alert.alert(
            'Photo non ajoutée à Photos',
            "La photo est bien dans l'album, mais autorise l'ajout à la photothèque dans les réglages pour la conserver aussi dans Photos.",
          );
        }
      } catch {
        // L'échec d'enregistrement dans Photos ne doit pas bloquer l'album.
      }
      // Appareil photo : la capture ne porte pas de GPS → position de l'appareil.
      const coords = (await resolveCoords(asset)) ?? (await getCurrentCoords());
      await addAsset(asset.uri, true, extractTakenAt(asset), coords);
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
      exif: true,
    });
    if (!res.canceled) {
      // Une seule photo → ouvre l'éditeur de commentaire ; plusieurs → ajout direct.
      const openEditor = res.assets.length === 1;
      for (const asset of res.assets) {
        await addAsset(
          asset.uri,
          openEditor,
          extractTakenAt(asset),
          await resolveCoords(asset),
        );
      }
    }
  }, [addAsset]);

  // Ajoute une page de texte seule (intro, dédicace, séparateur) et l'ouvre pour
  // saisir le texte. Réordonnable comme une photo.
  const addTextPage = useCallback(() => {
    const entry: Photo = {
      id: newId(),
      kind: 'text',
      albumId: album.id,
      uri: '',
      comment: '',
      createdAt: Date.now(),
    };
    setPhotos((prev) => [...prev, entry]);
    setEditing(entry);
  }, [album.id, setPhotos]);

  // Enregistre une photo recadrée : la version recadrée devient la nouvelle base
  // (les réglages d'image sont réinitialisés, ils se recomposeront dessus).
  const saveCrop = useCallback(
    async (id: string, croppedUri: string) => {
      const target = photos.find((p) => p.id === id);
      if (!target || target.uri === croppedUri) {
        setCropping(null);
        return;
      }
      try {
        const persisted = await persistImage(croppedUri, `${id}-crop-${Date.now()}`);
        setPhotos((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            if (p.uri && p.uri !== persisted) deleteImage(p.uri);
            if (p.originalUri && p.originalUri !== p.uri) deleteImage(p.originalUri);
            return { ...p, uri: persisted, originalUri: persisted, adjustments: undefined };
          }),
        );
      } catch {
        Alert.alert('Erreur', "Impossible d'enregistrer le recadrage.");
      } finally {
        setCropping(null);
      }
    },
    [photos, setPhotos],
  );

  const saveComment = useCallback(
    (id: string, comment: string, place: string) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, comment, place: place || undefined } : p,
        ),
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

  const albumTitle = album.name.trim() || 'Mon album';

  // Étape 1 : prépare l'aperçu (même HTML que le PDF) à partir des options.
  const openPreview = useCallback(
    async (options: ExportOptions) => {
      if (photos.length === 0) return;
      setExportOptions(options);
      saveExportOptions(options);
      setPreparing(true);
      try {
        const html = await buildAlbumHtml(
          orderedPhotos,
          albumTitle,
          options,
          defaultCoverId,
        );
        setPreviewHtml(html);
        setExportVisible(false);
        setPreviewVisible(true);
      } catch {
        Alert.alert('Erreur', "La préparation de l'aperçu a échoué.");
      } finally {
        setPreparing(false);
      }
    },
    [photos.length, orderedPhotos, albumTitle, defaultCoverId],
  );

  // Étape 2a : PDF prêt à imprimer, nommé, puis feuille de partage. Reconstruit
  // le HTML depuis les options courantes (fonctionne aussi en partage direct,
  // sans être passé par l'aperçu).
  const sendPdf = useCallback(async () => {
    setSending(true);
    try {
      const html = await buildAlbumHtml(
        orderedPhotos,
        albumTitle,
        exportOptions,
        defaultCoverId,
      );
      const uri = await htmlToPdfFile(html, albumTitle);
      await shareFile(uri, albumTitle, 'application/pdf', 'com.adobe.pdf');
      setPreviewVisible(false);
    } catch {
      Alert.alert('Erreur', 'La génération du PDF a échoué.');
    } finally {
      setSending(false);
    }
  }, [orderedPhotos, albumTitle, exportOptions, defaultCoverId]);

  // Étape 2b : une image JPEG par page, partagée via la feuille d'envoi. Une
  // seule page → l'image directement ; plusieurs → un ZIP unique (expo-sharing
  // ne partageant qu'un fichier à la fois).
  const sendImages = useCallback(async () => {
    setSending(true);
    try {
      const uris = await buildAlbumImages(
        orderedPhotos,
        albumTitle,
        exportOptions,
        defaultCoverId,
      );
      if (uris.length === 0) throw new Error('aucune page générée');
      if (uris.length === 1) {
        await shareFile(uris[0], albumTitle, 'image/jpeg', 'public.jpeg');
      } else {
        const zip = await zipImages(uris, albumTitle);
        await shareFile(zip, albumTitle, 'application/zip', 'public.zip-archive');
      }
      setPreviewVisible(false);
    } catch {
      Alert.alert('Erreur', 'La génération des images a échoué.');
    } finally {
      setSending(false);
    }
  }, [orderedPhotos, albumTitle, exportOptions, defaultCoverId]);

  // Étape 2c : les photos AFFICHÉES (fichiers d'origine réutilisables) + un
  // fichier de contexte, dans un ZIP — pour que le destinataire retravaille les
  // vraies photos (et pas seulement le rendu de l'album).
  const sendReusablePhotos = useCallback(async () => {
    setSending(true);
    try {
      const images = orderedPhotos.filter((p) => p.kind !== 'text');
      if (images.length === 0) {
        Alert.alert('Aucune photo', "Cet album ne contient pas de photo à envoyer.");
        return;
      }
      const zip = await zipPhotos(orderedPhotos, albumTitle);
      await shareFile(zip, albumTitle, 'application/zip', 'public.zip-archive');
      setPreviewVisible(false);
    } catch {
      Alert.alert('Erreur', 'La préparation des photos a échoué.');
    } finally {
      setSending(false);
    }
  }, [orderedPhotos, albumTitle]);

  // Choix du format au moment de l'envoi. Chaque option ouvre la feuille de
  // partage native (Messenger, Mail, AirDrop… y figurent selon le contenu).
  const chooseFormat = useCallback(() => {
    if (photos.length === 0) return;
    Alert.alert('Envoyer le mini album', 'Choisis le format', [
      { text: 'PDF', onPress: sendPdf },
      { text: "Images de l'album", onPress: sendImages },
      { text: 'Photos (à réutiliser)', onPress: sendReusablePhotos },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }, [photos.length, sendPdf, sendImages, sendReusablePhotos]);

  // Les deux boutons de rendu (barre du bas) sont les points d'entrée de l'export :
  // « Familial » ouvre d'abord la mise en page ; « Professionnel » va directement
  // à l'aperçu avant envoi (gabarit sobre imposé, sans réglages).
  const openFamilial = useCallback(() => {
    if (photos.length === 0) return;
    const next: ExportOptions = { ...exportOptions, style: 'family' };
    setExportOptions(next);
    saveExportOptions(next);
    setExportVisible(true);
  }, [photos.length, exportOptions]);

  const openPro = useCallback(() => {
    if (photos.length === 0) return;
    const next: ExportOptions = { ...exportOptions, style: 'pro' };
    setExportOptions(next);
    saveExportOptions(next);
    setExportVisible(true);
  }, [photos.length, exportOptions]);

  const sendLabel = exportOptions.style === 'pro' ? 'Envoyer' : "Partager l'album";

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={14} onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backLink}>
            <Text style={styles.backChevron}>‹ </Text>Dossiers
          </Text>
        </Pressable>
        <TextInput
          style={styles.titleInput}
          value={album.name}
          onChangeText={onRename}
          placeholder="Nom du dossier"
          placeholderTextColor="#9ca3af"
          autoCorrect
          spellCheck
          autoCapitalize="sentences"
        />
        <Text style={styles.count}>
          {photos.length} photo{photos.length > 1 ? 's' : ''}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            style={[styles.topBtn, styles.btnLight]}
            onPress={takePhoto}
          >
            <Text style={styles.btnLightText}>＋  Nouvelle photo</Text>
          </Pressable>
          <Pressable
            style={[styles.topBtn, styles.btnLight]}
            onPress={pickFromLibrary}
          >
            <Text style={styles.btnLightText}>🖼  Galerie photos</Text>
          </Pressable>
        </View>
        <Pressable style={styles.textPageBtn} onPress={addTextPage}>
          <Text style={styles.textPageBtnText}>＋ Page de texte</Text>
        </Pressable>
      </View>

      <FlatList
        data={orderedPhotos}
        keyExtractor={(p) => p.id}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <PhotoCard
            photo={item}
            isCover={item.id === defaultCoverId}
            onEdit={setEditing}
            onSetCover={(photo) => onSetCover(photo.id)}
            onAdjust={setAdjusting}
            onCrop={setCropping}
            onDelete={removePhoto}
            onMoveUp={() => movePhoto(item.id, 'up')}
            onMoveDown={() => movePhoto(item.id, 'down')}
            isFirst={index === 0}
            isLast={index === orderedPhotos.length - 1}
          />
        )}
        ListHeaderComponent={
          photos.length > 1 ? (
            <Text style={styles.reorderHint}>
              Utilisez ▲▼ pour réordonner les photos
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aucune photo</Text>
            <Text style={styles.emptyText}>
              Prenez une photo ou importez-en une depuis votre galerie photo de
              votre portable, puis ajoutez un commentaire si vous le souhaitez.
            </Text>
          </View>
        }
      />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.renduLabel}>CRÉEZ VOTRE ALBUM EN MODE</Text>
        {preparing ? (
          <View style={[styles.btn, styles.btnFamilial]}>
            <ActivityIndicator color={C.paper} />
          </View>
        ) : (
          <View style={styles.renduRow}>
            <Pressable
              style={[
                styles.btn,
                styles.rowBtn,
                styles.btnFamilial,
                photos.length === 0 && styles.btnDisabled,
              ]}
              disabled={photos.length === 0}
              onPress={openFamilial}
            >
              <Text style={styles.btnActionText}>Privé</Text>
            </Pressable>
            <Text style={styles.orText}>ou</Text>
            <Pressable
              style={[
                styles.btn,
                styles.rowBtn,
                styles.btnPro,
                photos.length === 0 && styles.btnDisabled,
              ]}
              disabled={photos.length === 0}
              onPress={openPro}
            >
              <Text style={styles.btnActionText}>Professionnel</Text>
            </Pressable>
          </View>
        )}
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

      <CropModal
        photo={cropping}
        onSave={saveCrop}
        onClose={() => setCropping(null)}
      />

      <ExportModal
        visible={exportVisible}
        initial={exportOptions}
        preparing={preparing}
        onPreview={openPreview}
        onClose={() => setExportVisible(false)}
      />

      <PreviewModal
        visible={previewVisible}
        html={previewHtml}
        sending={sending}
        sendLabel={sendLabel}
        onBackToAlbum={() => {
          setPreviewVisible(false);
          setExportVisible(false);
        }}
        onEditLayout={() => {
          setPreviewVisible(false);
          setExportVisible(true);
        }}
        onSend={chooseFormat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  center: { alignItems: 'center', justifyContent: 'center' },
  reorderHint: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  kicker: {
    fontFamily: F.mono,
    fontSize: 11,
    color: C.sienna,
    letterSpacing: 3,
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 4 },
  backLink: {
    fontFamily: F.monoBold,
    fontSize: 18,
    color: C.sienna,
    letterSpacing: 0.5,
  },
  backChevron: { fontFamily: F.monoBold, fontSize: 28 },
  homeTitle: {
    fontFamily: F.display,
    fontSize: 40,
    color: C.ink,
    paddingVertical: 2,
    marginTop: 2,
  },
  titleInput: {
    fontFamily: F.display,
    fontSize: 34,
    color: C.ink,
    paddingVertical: 2,
  },
  count: {
    fontFamily: F.mono,
    fontSize: 12,
    color: C.muted,
    letterSpacing: 1,
    marginTop: 4,
  },
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
    fontFamily: F.display,
    fontSize: 24,
    color: C.inkSoft,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  toolbar: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
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
  topActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  topBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textPageBtn: {
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  textPageBtnText: { fontFamily: F.mono, fontSize: 13, color: C.inkSoft, letterSpacing: 0.5 },
  renduRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  orText: {
    fontFamily: F.mono,
    fontSize: 13,
    color: C.muted,
    letterSpacing: 1,
  },
  renduLabel: {
    fontFamily: F.monoBold,
    fontSize: 12,
    letterSpacing: 2,
    color: C.muted,
    marginBottom: 10,
  },
  btnFamilial: { backgroundColor: C.sienna },
  btnPro: { backgroundColor: C.ink },
  btnActionText: {
    fontFamily: F.monoBold,
    fontSize: 16,
    color: C.paper,
    letterSpacing: 0.5,
  },
  renduChip: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.tan,
  },
  renduChipOn: { backgroundColor: C.sienna },
  renduChipText: {
    fontFamily: F.monoBold,
    fontSize: 15,
    color: C.ink,
    letterSpacing: 0.5,
  },
  renduChipTextOn: { color: C.paper },
  btnGhost: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.sienna,
    backgroundColor: 'transparent',
  },
  btnGhostText: { fontFamily: F.mono, color: C.sienna, fontSize: 13, letterSpacing: 0.5 },
  btnLight: { backgroundColor: C.tan },
  btnLightText: { fontFamily: F.monoBold, color: C.ink, fontSize: 15 },
  btnPrimary: { backgroundColor: C.ink },
  btnPrimaryText: {
    fontFamily: F.monoBold,
    color: C.paper,
    fontSize: 15,
    letterSpacing: 1,
  },
  btnDisabled: { opacity: 0.4 },
});

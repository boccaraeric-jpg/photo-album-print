import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
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
import * as DocumentPicker from 'expo-document-picker';
import {
  useCameraPermissions,
  type CameraCapturedPicture,
} from 'expo-camera';

import { C, F } from './src/theme';

import type {
  Adjustments,
  Album,
  AlbumSort,
  ExportOptions,
  Photo,
} from './src/types';
import {
  comparePhotos,
  loadAlbumSort,
  loadData,
  loadExportOptions,
  loadLang,
  saveAlbums,
  saveAlbumSort,
  saveExportOptions,
  saveLang,
  savePhotos,
} from './src/storage';
import {
  DEFAULT_LANG,
  detectDeviceLang,
  dict,
  LangContext,
  localeTag,
  SUPPORTED,
  useLang,
  type Lang,
} from './src/i18n';
import { newId } from './src/id';
import { extractTakenAt } from './src/exif';
import { getCurrentCoords, resolveCoords } from './src/photoLocation';
import { reverseGeocode } from './src/geocode';
import { copyImage, deleteImage, persistImage } from './src/photoFiles';
import { saveToPhotoLibrary } from './src/mediaLibrary';
import { zipImages, zipPhotos } from './src/albumZip';
import {
  buildAlbumBundle,
  looksLikeBundle,
  parseAlbumBundle,
  type ImportedEntry,
} from './src/albumBundle';
import { bakeAdjustedImage, isNeutral } from './src/adjustments';
import { shareInstallLink } from './src/links';
import {
  buildAlbumHtml,
  DEFAULT_EXPORT_OPTIONS,
  htmlToPdfFile,
  shareFile,
} from './src/pdf';
import { buildAlbumImages } from './src/pageImages';
import {
  ShareIntentProvider,
  useShareIntentContext,
} from 'expo-share-intent';
import { PhotoCard } from './src/components/PhotoCard';
import { AlbumCard } from './src/components/AlbumCard';
import { ShareImportModal } from './src/components/ShareImportModal';
import { CommentModal } from './src/components/CommentModal';
import { AdjustModal } from './src/components/AdjustModal';
import { NameModal } from './src/components/NameModal';
import { ExportModal } from './src/components/ExportModal';
import { PreviewModal } from './src/components/PreviewModal';
import { CameraModal } from './src/components/CameraModal';
import { PhotoViewerModal } from './src/components/PhotoViewerModal';
import { CropModal } from './src/components/CropModal';
import { WelcomeScreen } from './src/components/WelcomeScreen';

// Ordre des puces de tri de l'accueil (libellés dans `L.home.sorts`).
const SORT_KEYS: AlbumSort[] = ['recent', 'name', 'count'];

/**
 * Normalise pour la recherche : minuscules et **sans accents**, afin que
 * « ete » trouve « Été ». `NFD` sépare les diacritiques, que l'on retire.
 */
function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

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
      {/* Fournit les photos reçues via le partage système (iOS Share Extension /
          intent Android). En Expo Go le module natif est absent : le provider
          no-op sans crasher (requireOptionalNativeModule). */}
      <ShareIntentProvider>
        <LangProvider>
          <Root />
        </LangProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}

/**
 * Fournit la langue courante à toute l'app. Au 1er lancement : langue forcée
 * persistée si elle existe, sinon langue de l'iPhone (repli français). Toute
 * bascule est mémorisée. Les composants sous ce provider se re-rendent quand la
 * langue change (le dictionnaire `L` change d'identité).
 */
function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => {
    (async () => {
      const saved = await loadLang();
      setLangState(saved ?? detectDeviceLang());
    })();
  }, []);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLang(next);
  }, []);
  const value = useMemo(
    () => ({ lang, setLang, L: dict(lang) }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

function Root() {
  const { L } = useLang();
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  // Duplication de dossier en cours (copie des fichiers photo : peut durer).
  const [duplicating, setDuplicating] = useState(false);
  // Import en attente (photos partagées OU album ComClic reçu d'un ami) :
  // nombre d'éléments, nom de dossier suggéré, et l'action d'import une fois le
  // dossier choisi. `null` tant qu'aucun partage n'est en cours.
  const [pendingImport, setPendingImport] = useState<{
    count: number;
    defaultName: string | null;
    run: (albumId: string) => void;
  } | null>(null);
  // Photo à ouvrir en édition à l'arrivée dans un album (import d'une seule photo).
  const [editOnOpen, setEditOnOpen] = useState<string | null>(null);

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

  // Duplique un dossier : nouveau dossier « Copie de … » + copie **de fichier**
  // pour chaque photo. Les copies sont indépendantes (supprimer une photo de la
  // copie n'efface pas l'original, cf. `deleteImage` qui supprime le fichier).
  const duplicateAlbum = useCallback(
    (album: Album) => {
      const albumPhotos = photos
        .filter((p) => p.albumId === album.id)
        .sort(comparePhotos);
      Alert.alert(
        L.alert.duplicateAlbumTitle(album.name.trim() || L.album.noName),
        L.alert.duplicateAlbumBody,
        [
          { text: L.common.cancel, style: 'cancel' },
          {
            text: L.common.duplicate,
            onPress: async () => {
              setDuplicating(true);
              try {
                const copyId = newId();
                const created: Photo[] = [];
                let coverId: string | undefined;
                for (const p of albumPhotos) {
                  const id = newId();
                  if (p.kind === 'text') {
                    created.push({ ...p, id, albumId: copyId });
                  } else {
                    // Une image ajustée garde son original : les deux fichiers
                    // sont copiés pour que la copie reste ré-éditable.
                    const uri = await copyImage(p.uri, id);
                    const originalUri =
                      p.originalUri && p.originalUri !== p.uri
                        ? await copyImage(p.originalUri, `${id}-orig`)
                        : undefined;
                    created.push({ ...p, id, albumId: copyId, uri, originalUri });
                  }
                  if (p.id === album.coverPhotoId) coverId = id;
                }
                const copy: Album = {
                  id: copyId,
                  name: L.album.copyName(album.name.trim() || L.album.noName),
                  createdAt: Date.now(),
                  coverPhotoId: coverId,
                };
                setAlbums((prev) => [...prev, copy]);
                if (created.length) setPhotos((prev) => [...prev, ...created]);
              } catch {
                Alert.alert(L.common.error, L.alert.duplicateFail);
              } finally {
                setDuplicating(false);
              }
            },
          },
        ],
      );
    },
    [photos, L],
  );

  const deleteAlbum = useCallback(
    (album: Album) => {
      Alert.alert(
        L.alert.deleteAlbumTitle(album.name.trim() || L.album.noName),
        L.alert.deleteAlbumBody,
        [
          { text: L.common.cancel, style: 'cancel' },
          {
            text: L.common.delete,
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
    [photos, L],
  );

  // Finalise un import : ferme le sélecteur, réinitialise le partage, ouvre le
  // dossier cible (et éventuellement l'éditeur d'une photo).
  const finishImport = useCallback(
    (albumId: string, editId: string | null) => {
      setPendingImport(null);
      resetShareIntent();
      setOpenAlbumId(albumId);
      setEditOnOpen(editId);
    },
    [resetShareIntent],
  );

  // Import d'images brutes (partage de photos) dans le dossier choisi.
  const runImageImport = useCallback(
    async (paths: string[], albumId: string) => {
      const created: Photo[] = [];
      for (const path of paths) {
        const id = newId();
        try {
          const persisted = await persistImage(path, id);
          created.push({
            id,
            albumId,
            uri: persisted,
            comment: '',
            createdAt: Date.now(),
          });
        } catch {
          // Fichier illisible : on ignore cette image, on garde les autres.
        }
      }
      if (created.length) setPhotos((prev) => [...prev, ...created]);
      // Une seule photo → ouvrir son éditeur en arrivant dans le dossier.
      finishImport(albumId, created.length === 1 ? created[0].id : null);
    },
    [finishImport],
  );

  // Import d'un album ComClic reçu : reconstruit chaque entrée avec ses méta
  // (commentaire, lieu, date, page de texte) et la couverture éventuelle.
  const runAlbumImport = useCallback(
    (entries: ImportedEntry[], albumId: string) => {
      const created: Photo[] = [];
      let coverId: string | undefined;
      const base = Date.now();
      entries.forEach((e, i) => {
        const id = newId();
        if (e.kind === 'text') {
          created.push({
            id,
            kind: 'text',
            albumId,
            uri: '',
            comment: e.comment,
            createdAt: base + i, // conserve l'ordre reçu
          });
        } else if (e.uri) {
          created.push({
            id,
            albumId,
            uri: e.uri,
            comment: e.comment,
            place: e.place,
            takenAt: e.takenAt,
            createdAt: base + i,
          });
          if (e.cover) coverId = id;
        }
      });
      if (created.length) setPhotos((prev) => [...prev, ...created]);
      if (coverId) {
        setAlbums((prev) =>
          prev.map((a) => (a.id === albumId ? { ...a, coverPhotoId: coverId } : a)),
        );
      }
      finishImport(albumId, null);
    },
    [finishImport],
  );

  /**
   * Ouvre un fichier `.comclic` depuis l'app Fichiers (Mail, Messages, iCloud…).
   *
   * Double du partage système, volontaire : `expo-share-intent` est un module
   * **natif**, donc inerte dans Expo Go, et la feuille de partage ne propose pas
   * toujours ComClic selon l'app d'origine. Ce chemin-ci passe par le même
   * `parseAlbumBundle` + `pendingImport`, donc le même écran de destination.
   */
  const importBundleFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      // Les .comclic sont des ZIP ; iOS ne connaît pas cette extension, d'où le
      // type large, avec vérification du contenu juste après.
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    if (!looksLikeBundle(file.name) && !looksLikeBundle(file.uri)) {
      Alert.alert(L.alert.importNotBundleTitle, L.alert.importNotBundleBody);
      return;
    }
    try {
      const parsed = await parseAlbumBundle(file.uri);
      if (!parsed) {
        Alert.alert(L.alert.importNotBundleTitle, L.alert.importNotBundleBody);
        return;
      }
      const photoCount = parsed.entries.filter((e) => e.kind === 'photo').length;
      setPendingImport({
        count: photoCount,
        defaultName: parsed.name || null,
        run: (albumId) => runAlbumImport(parsed.entries, albumId),
      });
    } catch {
      Alert.alert(L.common.error, L.alert.importFailBody);
    }
  }, [runAlbumImport, L]);

  // Partage système entrant → album ComClic (prioritaire) sinon images.
  // (En Expo Go, `hasShareIntent` reste faux : module natif absent.)
  useEffect(() => {
    if (!hasShareIntent) return;
    let cancelled = false;
    (async () => {
      const files = shareIntent?.files ?? [];
      // 1) Fichier album ComClic (.comclic / .zip contenant un manifeste) ?
      const bundle = files.find(
        (f) => looksLikeBundle(f.path) || looksLikeBundle(f.fileName ?? ''),
      );
      if (bundle) {
        const parsed = await parseAlbumBundle(bundle.path);
        if (parsed && !cancelled) {
          const photoCount = parsed.entries.filter((e) => e.kind === 'photo').length;
          setShowWelcome(false);
          setPendingImport({
            count: photoCount,
            defaultName: parsed.name || null,
            run: (albumId) => runAlbumImport(parsed.entries, albumId),
          });
          return;
        }
      }
      // 2) Sinon : images brutes partagées.
      const paths = files
        .filter((f) => f.mimeType?.startsWith('image/'))
        .map((f) => f.path)
        .filter((p): p is string => !!p);
      if (paths.length > 0 && !cancelled) {
        setShowWelcome(false);
        setPendingImport({
          count: paths.length,
          defaultName: null,
          run: (albumId) => runImageImport(paths, albumId),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasShareIntent, shareIntent, runAlbumImport, runImageImport]);

  const openAlbum = albums.find((a) => a.id === openAlbumId) ?? null;

  const shareModal = pendingImport && !loading && (
    <ShareImportModal
      count={pendingImport.count}
      albums={albums}
      photoCountOf={(id) => photos.filter((p) => p.albumId === id).length}
      defaultName={pendingImport.defaultName ?? undefined}
      onPick={(albumId) => pendingImport.run(albumId)}
      onCreate={(name) => {
        const album: Album = { id: newId(), name, createdAt: Date.now() };
        setAlbums((prev) => [...prev, album]);
        pendingImport.run(album.id);
      }}
      onCancel={() => {
        setPendingImport(null);
        resetShareIntent();
      }}
    />
  );

  let content: ReactNode;
  if (showWelcome) {
    content = <WelcomeScreen onEnter={() => setShowWelcome(false)} />;
  } else if (loading) {
    content = (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color="#A64B24" />
      </View>
    );
  } else if (openAlbum) {
    content = (
      <AlbumScreen
        album={openAlbum}
        photos={photos.filter((p) => p.albumId === openAlbum.id)}
        setPhotos={setPhotos}
        onRename={(name) => renameAlbum(openAlbum.id, name)}
        onSetCover={(photoId) => setAlbumCover(openAlbum.id, photoId)}
        onBack={() => setOpenAlbumId(null)}
        initialEditPhotoId={editOnOpen}
        onEditConsumed={() => setEditOnOpen(null)}
      />
    );
  } else {
    content = (
      <HomeScreen
        albums={albums}
        photos={photos}
        onOpen={(album) => setOpenAlbumId(album.id)}
        onCreate={createAlbum}
        onRename={renameAlbum}
        onDuplicate={duplicateAlbum}
        onDelete={deleteAlbum}
        onImportBundle={importBundleFile}
      />
    );
  }

  return (
    <>
      {content}
      {shareModal}
      {duplicating && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={C.sienna} />
          <Text style={styles.busyText}>{L.home.duplicating}</Text>
        </View>
      )}
    </>
  );
}

interface HomeProps {
  albums: Album[];
  photos: Photo[];
  onOpen: (album: Album) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (album: Album) => void;
  onDelete: (album: Album) => void;
  /** Ouvre un fichier .comclic reçu d'un autre utilisateur (app Fichiers). */
  onImportBundle: () => void;
}

function HomeScreen({
  albums,
  photos,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onImportBundle,
}: HomeProps) {
  const { L, lang, setLang } = useLang();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Album | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AlbumSort>('recent');

  // Le tri est retrouvé au lancement suivant (le texte cherché, lui, ne l'est pas).
  useEffect(() => {
    loadAlbumSort().then((stored) => {
      if (stored) setSort(stored);
    });
  }, []);

  const chooseSort = useCallback((next: AlbumSort) => {
    setSort(next);
    saveAlbumSort(next);
  }, []);

  // Nombre de photos par dossier : sert au tri « Photos » et à chaque carte.
  const countById = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of photos) map.set(p.albumId, (map.get(p.albumId) ?? 0) + 1);
    return map;
  }, [photos]);

  const visibleAlbums = useMemo(() => {
    const needle = normalizeSearch(query);
    const kept = needle
      ? albums.filter((a) => normalizeSearch(a.name).includes(needle))
      : albums;
    const sorted = [...kept];
    if (sort === 'name') {
      sorted.sort((a, b) =>
        a.name.localeCompare(b.name, localeTag(lang), { sensitivity: 'base' }),
      );
    } else if (sort === 'count') {
      sorted.sort((a, b) => (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0));
    } else {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    }
    return sorted;
  }, [albums, query, sort, countById, lang]);

  const searching = query.trim().length > 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.langRow}>
          {SUPPORTED.map((code) => (
            <Pressable
              key={code}
              hitSlop={8}
              onPress={() => setLang(code)}
              style={[styles.langChip, lang === code && styles.langChipOn]}
            >
              <Text
                style={[styles.langText, lang === code && styles.langTextOn]}
              >
                {code.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.brandRow}>
          <Image source={require('./assets/logo-mark.png')} style={styles.brandLogo} />
          <Text style={styles.kicker}>{L.home.kicker}</Text>
        </View>
        <Text style={styles.homeTitle}>{L.home.title}</Text>
        <Text style={styles.count}>
          {searching
            ? L.home.foundCount(visibleAlbums.length)
            : L.home.folderCount(albums.length)}
        </Text>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={L.home.searchPlaceholder}
          placeholderTextColor={C.faint}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />

        <View style={styles.sortRow}>
          {SORT_KEYS.map((key) => {
            const on = sort === key;
            return (
              <Pressable
                key={key}
                style={[styles.sortChip, on && styles.sortChipOn]}
                onPress={() => chooseSort(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.sortText, on && styles.sortTextOn]}>
                  {L.home.sorts[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={visibleAlbums}
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
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {searching ? L.home.noMatchTitle : L.home.emptyTitle}
            </Text>
            <Text style={styles.emptyText}>
              {searching ? L.home.noMatchText : L.home.emptyText}
            </Text>
          </View>
        }
      />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => setCreating(true)}
        >
          <Text style={styles.btnPrimaryText}>{L.home.newFolder}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={onImportBundle}
        >
          <Text style={styles.btnGhostText}>{L.home.importAlbum}</Text>
        </Pressable>
      </View>

      <NameModal
        visible={creating}
        title={L.home.createTitle}
        initialValue=""
        submitLabel={L.home.createSubmit}
        onSubmit={(name) => {
          setCreating(false);
          onCreate(name);
        }}
        onClose={() => setCreating(false)}
      />

      <NameModal
        visible={renaming !== null}
        title={L.home.renameTitle}
        initialValue={renaming?.name ?? ''}
        submitLabel={L.home.renameSubmit}
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
  /** Photo à ouvrir en édition à l'arrivée (import d'une photo partagée). */
  initialEditPhotoId?: string | null;
  /** Signale que l'ouverture auto de l'éditeur a été consommée. */
  onEditConsumed?: () => void;
}

function AlbumScreen({
  album,
  photos,
  setPhotos,
  onRename,
  onSetCover,
  onBack,
  initialEditPhotoId,
  onEditConsumed,
}: AlbumProps) {
  const { L, lang } = useLang();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<Photo | null>(null);
  const [adjusting, setAdjusting] = useState<Photo | null>(null);
  const [cropping, setCropping] = useState<Photo | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [, requestCameraPermission] = useCameraPermissions();
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

  // Import d'une seule photo partagée : ouvrir directement son éditeur.
  useEffect(() => {
    if (!initialEditPhotoId) return;
    const target = photos.find((p) => p.id === initialEditPhotoId);
    if (target) {
      setEditing(target);
      onEditConsumed?.();
    }
  }, [initialEditPhotoId, photos, onEditConsumed]);

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
              // Si l'éditeur de cette photo est déjà ouvert, y refléter le lieu
              // résolu (sinon le champ « Lieu » resterait vide sous les yeux de
              // l'utilisateur alors que la position a bien été trouvée).
              setEditing((cur) => (cur && cur.id === id ? { ...cur, place } : cur));
            }
          });
        }
      } catch {
        Alert.alert(L.common.error, L.alert.savePhotoFail);
      }
    },
    [album.id, setPhotos],
  );

  // Ouvre l'appareil photo **intégré** (`CameraModal`) plutôt que la caméra
  // système : celle d'iOS impose son écran « Use Photo / Retake » après chaque
  // déclenchement, redondant avec la suppression depuis le dossier.
  const takePhoto = useCallback(async () => {
    const perm = await requestCameraPermission();
    if (!perm?.granted) {
      Alert.alert(L.alert.permTitle, L.alert.permCameraBody);
      return;
    }
    setCapturing(true);
  }, [requestCameraPermission, L]);

  // Photo prise dans `CameraModal` : même traitement qu'avant (photothèque,
  // position de l'appareil, ouverture de l'éditeur de commentaire).
  const onCapture = useCallback(
    async (picture: CameraCapturedPicture) => {
      setCapturing(false);
      // Enregistre d'abord la photo dans la photothèque du téléphone
      // (sans commentaire), pour la conserver en dehors de l'album.
      try {
        const saved = await saveToPhotoLibrary(picture.uri);
        if (!saved) {
          Alert.alert(L.alert.photoNotAddedTitle, L.alert.photoNotAddedBody);
        }
      } catch {
        // L'échec d'enregistrement dans Photos ne doit pas bloquer l'album.
      }
      // La capture ne porte pas de GPS → position de l'appareil.
      const coords = await getCurrentCoords();
      await addAsset(picture.uri, true, extractTakenAt(picture), coords);
    },
    [addAsset, L],
  );

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(L.alert.permTitle, L.alert.permLibraryBody);
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
  // saisir le texte. Réordonnable ensuite comme une photo par les boutons ▲▼.
  const addTextPage = useCallback(() => {
    const create = (position: 'start' | 'end') => {
      const entry: Photo = {
        id: newId(),
        kind: 'text',
        albumId: album.id,
        uri: '',
        comment: '',
        createdAt: Date.now(),
      };
      if (position === 'end') {
        // `order` laissé indéfini : la comparaison place l'entrée en fin de dossier.
        setPhotos((prev) => [...prev, entry]);
      } else {
        // En tête : il faut renuméroter tout le dossier, un simple `order: 0`
        // entrerait en conflit avec la photo qui porte déjà ce rang.
        const rankById = new Map(
          [entry, ...orderedPhotos].map((p, i) => [p.id, i] as const),
        );
        setPhotos((prev) => [
          ...prev.map((p) =>
            rankById.has(p.id) ? { ...p, order: rankById.get(p.id)! } : p,
          ),
          { ...entry, order: 0 },
        ]);
      }
      setEditing(entry);
    };

    // « Au début » = juste après la 1ʳᵉ de couverture, la couverture n'étant pas
    // une entrée du dossier mais une page générée au rendu.
    Alert.alert(L.alert.textPageTitle, L.alert.textPageBody, [
      { text: L.alert.textPageAtStart, onPress: () => create('start') },
      { text: L.alert.textPageAtEnd, onPress: () => create('end') },
      { text: L.common.cancel, style: 'cancel' },
    ]);
  }, [album.id, orderedPhotos, setPhotos, L]);

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
        Alert.alert(L.common.error, L.alert.saveCropFail);
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
        Alert.alert(L.common.error, L.alert.applyAdjustFail);
      }
    },
    [setPhotos],
  );

  const removePhoto = useCallback(
    (photo: Photo) => {
      Alert.alert(L.alert.deletePhotoTitle, undefined, [
        { text: L.common.cancel, style: 'cancel' },
        {
          text: L.common.delete,
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

  const albumTitle = album.name.trim() || L.albumScreen.defaultTitle;

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
          lang,
        );
        setPreviewHtml(html);
        setExportVisible(false);
        setPreviewVisible(true);
      } catch {
        Alert.alert(L.common.error, L.alert.previewFail);
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
        lang,
      );
      const uri = await htmlToPdfFile(html, albumTitle);
      await shareFile(uri, albumTitle, 'application/pdf', 'com.adobe.pdf');
      setPreviewVisible(false);
    } catch {
      Alert.alert(L.common.error, L.alert.pdfFail);
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
        lang,
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
      Alert.alert(L.common.error, L.alert.imagesFail);
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
        Alert.alert(L.alert.noPhotoTitle, L.alert.noPhotoBody);
        return;
      }
      const zip = await zipPhotos(orderedPhotos, albumTitle, lang);
      await shareFile(zip, albumTitle, 'application/zip', 'public.zip-archive');
      setPreviewVisible(false);
    } catch {
      Alert.alert(L.common.error, L.alert.photosPrepFail);
    } finally {
      setSending(false);
    }
  }, [orderedPhotos, albumTitle]);

  // Le destinataire d'un album ComClic a besoin de l'app pour l'ouvrir : on lui
  // propose le lien d'installation dans un message texte séparé (la feuille de
  // partage native n'accepte pas fichier + texte dans le même envoi).
  // ⚠️ iOS avale une Alert présentée pendant la fermeture d'une feuille de
  // partage ou d'un Modal : on laisse l'animation se terminer avant d'ouvrir.
  const offerInstallLink = useCallback(() => {
    setTimeout(() => {
      Alert.alert(L.invite.title, L.invite.body, [
        { text: L.common.later, style: 'cancel' },
        {
          text: L.invite.send,
          onPress: () => {
            shareInstallLink(lang).catch(() => {
              Alert.alert(L.common.error, L.invite.fail);
            });
          },
        },
      ]);
    }, 600);
  }, [L, lang]);

  // Étape 2d : album ComClic (.comclic) = images pleine réso + manifeste
  // (commentaires, lieux, dates, ordre, couverture, textes). Destiné à un ami
  // qui a ComClic : il le reçoit via le partage système et l'app le reconstruit.
  const sendComclicAlbum = useCallback(async () => {
    setSending(true);
    try {
      const uri = await buildAlbumBundle(orderedPhotos, albumTitle, defaultCoverId);
      await shareFile(uri, albumTitle, 'application/zip', 'public.zip-archive');
      setPreviewVisible(false);
      // Un .comclic ne s'ouvre qu'avec l'app : proposer d'envoyer le lien
      // d'installation au destinataire, dans un second message.
      offerInstallLink();
    } catch {
      Alert.alert(L.common.error, L.alert.photosPrepFail);
    } finally {
      setSending(false);
    }
  }, [orderedPhotos, albumTitle, defaultCoverId, offerInstallLink]);

  // Choix du format au moment de l'envoi. Chaque option ouvre la feuille de
  // partage native (Messenger, Mail, AirDrop… y figurent selon le contenu).
  const chooseFormat = useCallback(() => {
    if (photos.length === 0) return;
    Alert.alert(L.format.title, L.format.subtitle, [
      { text: L.format.pdf, onPress: sendPdf },
      { text: L.format.albumImages, onPress: sendImages },
      { text: L.format.reusablePhotos, onPress: sendReusablePhotos },
      { text: L.format.comclicAlbum, onPress: sendComclicAlbum },
      { text: L.common.cancel, style: 'cancel' },
    ]);
  }, [photos.length, sendPdf, sendImages, sendReusablePhotos, sendComclicAlbum]);

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

  const sendLabel =
    exportOptions.style === 'pro'
      ? L.albumScreen.sendLabelPro
      : L.albumScreen.sendLabelFamily;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.brandRow}>
          <Pressable hitSlop={14} onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backLink}>
              <Text style={styles.backChevron}>‹ </Text>{L.albumScreen.back}
            </Text>
          </Pressable>
          <Image source={require('./assets/logo-mark.png')} style={styles.brandLogo} />
        </View>
        <TextInput
          style={styles.titleInput}
          value={album.name}
          onChangeText={onRename}
          placeholder={L.nameModal.folderPlaceholder}
          placeholderTextColor="#9ca3af"
          autoCorrect
          spellCheck
          autoCapitalize="sentences"
        />
        <Text style={styles.count}>{L.album.photoCount(photos.length)}</Text>
        <View style={styles.topActions}>
          <Pressable
            style={[styles.topBtn, styles.btnLight]}
            onPress={takePhoto}
          >
            <Text style={styles.btnLightText}>{L.albumScreen.newPhoto}</Text>
          </Pressable>
          <Pressable
            style={[styles.topBtn, styles.btnLight]}
            onPress={pickFromLibrary}
          >
            <Text style={styles.btnLightText}>{L.albumScreen.gallery}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.textPageBtn} onPress={addTextPage}>
          <Text style={styles.textPageBtnText}>{L.albumScreen.textPage}</Text>
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
            onView={setViewing}
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
            <Text style={styles.reorderHint}>{L.albumScreen.reorderHint}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{L.albumScreen.emptyTitle}</Text>
            <Text style={styles.emptyText}>{L.albumScreen.emptyText}</Text>
          </View>
        }
      />

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.renduLabel}>{L.albumScreen.modeLabel}</Text>
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
              <Text style={styles.btnActionText}>{L.albumScreen.private}</Text>
            </Pressable>
            <Text style={styles.orText}>{L.albumScreen.or}</Text>
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
              <Text style={styles.btnActionText}>{L.albumScreen.professional}</Text>
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

      <CameraModal
        visible={capturing}
        onCapture={onCapture}
        onClose={() => setCapturing(false)}
      />

      <PhotoViewerModal photo={viewing} onClose={() => setViewing(null)} />

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
  // Voile bloquant pendant la duplication d'un dossier (copie des fichiers).
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(32,27,20,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  busyText: {
    fontFamily: F.monoBold,
    fontSize: 13,
    color: C.card,
    letterSpacing: 1,
  },
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
  langRow: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    gap: 6,
    marginBottom: 6,
  },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: C.tan,
  },
  langChipOn: { backgroundColor: C.sienna },
  langText: {
    fontFamily: F.monoBold,
    fontSize: 12,
    color: C.inkSoft,
    letterSpacing: 1,
  },
  langTextOn: { color: C.paper },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 4 },
  // Rappel de l'icône de l'app en haut de chaque écran (accueil : à gauche du
  // sur-titre ; dossier : à droite du lien de retour).
  search: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    fontFamily: F.mono,
    fontSize: 15,
    color: C.ink,
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.tan,
  },
  sortChipOn: { backgroundColor: C.sienna },
  sortText: { fontFamily: F.monoBold, fontSize: 13, color: C.ink },
  sortTextOn: { color: C.paper },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandRowSpread: { justifyContent: 'space-between' },
  brandLogo: { width: 34, height: 34, resizeMode: 'contain' },
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

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { CameraView, type CameraCapturedPicture, type CameraType, type FlashMode } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { useLang } from '../i18n';

interface Props {
  visible: boolean;
  /** Photo prise : ajoutée directement au dossier, sans écran de confirmation. */
  onCapture: (picture: CameraCapturedPicture) => void;
  onClose: () => void;
}

const FLASH_ORDER: FlashMode[] = ['auto', 'on', 'off'];

/**
 * Appareil photo **intégré à l'app**, en remplacement de
 * `ImagePicker.launchCameraAsync()`.
 *
 * Raison d'être : la caméra système d'iOS impose son écran « Use Photo /
 * Retake » après chaque déclenchement, et `expo-image-picker` n'expose aucune
 * option pour le sauter. Ici le déclencheur renvoie la photo immédiatement —
 * l'utilisateur la supprime depuis le dossier si elle ne convient pas.
 */
export function CameraModal({ visible, onCapture, onClose }: Props) {
  const { L } = useLang();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Zoom `expo-camera` : 0 = grand angle, 1 = zoom maximal de l'appareil. Réglé
  // au curseur et non au pincement — `react-native-gesture-handler` n'est pas
  // une dépendance du projet, et les gestes sont évités ici (cf. `CropModal`).
  const [zoom, setZoom] = useState(0);

  // Chaque ouverture repart du grand angle, et `ready` doit retomber : la
  // prévisualisation est démontée à la fermeture (`{visible && <CameraView/>}`),
  // un `ready` resté à `true` autoriserait un déclenchement avant `onCameraReady`.
  useEffect(() => {
    if (visible) {
      setZoom(0);
      setReady(false);
    }
  }, [visible]);

  const shoot = async () => {
    // `onCameraReady` doit avoir été reçu, et un seul déclenchement à la fois.
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({
        quality: 0.8,
        exif: true,
      });
      if (picture) onCapture(picture);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      // La prévisualisation occupe tout l'écran : barre d'état en blanc.
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {visible && (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            flash={flash}
            zoom={zoom}
            onCameraReady={() => setReady(true)}
          />
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button">
            <Text style={styles.topText}>{L.common.close}</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setFlash(
                (f) => FLASH_ORDER[(FLASH_ORDER.indexOf(f) + 1) % FLASH_ORDER.length],
              )
            }
            hitSlop={14}
            accessibilityRole="button"
          >
            <Text style={styles.topText}>{L.camera.flash[flash]}</Text>
          </Pressable>
        </View>

        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>{L.camera.zoom}</Text>
          <Slider
            style={styles.zoomSlider}
            minimumValue={0}
            maximumValue={1}
            value={zoom}
            onValueChange={setZoom}
            minimumTrackTintColor="#ffffff"
            maximumTrackTintColor="rgba(255,255,255,0.35)"
            thumbTintColor="#ffffff"
          />
        </View>

        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.side} />
          <Pressable
            onPress={shoot}
            disabled={!ready || busy}
            style={[styles.shutter, (!ready || busy) && styles.shutterOff]}
            accessibilityRole="button"
            accessibilityLabel={L.camera.take}
          >
            {busy ? (
              <ActivityIndicator color={C.ink} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>
          <Pressable
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            hitSlop={14}
            style={styles.side}
            accessibilityRole="button"
          >
            <Text style={styles.sideText}>{L.camera.flip}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 10,
  },
  topText: {
    fontFamily: F.monoBold,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.5,
  },
  zoomRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 28,
  },
  zoomLabel: {
    fontFamily: F.monoBold,
    fontSize: 12,
    color: '#fff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  zoomSlider: { flex: 1, height: 40 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 18,
  },
  side: { width: 92 },
  sideText: {
    fontFamily: F.monoBold,
    fontSize: 15,
    color: '#fff',
    textAlign: 'right',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOff: { opacity: 0.4 },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
});

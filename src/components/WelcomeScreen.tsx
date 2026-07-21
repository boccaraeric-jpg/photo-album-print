import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Canvas,
  Circle,
  LinearGradient,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { C, F } from '../theme';

interface Props {
  /** L'utilisateur entre dans l'app (bouton « Commencer »). */
  onEnter: () => void;
}

/** Écran d'accueil « Chambre Claire » : halo + reflet symétrique (Skia), logo,
 *  titre CLICMEMO et bouton d'entrée. */
export function WelcomeScreen({ onEnter }: Props) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={W} height={H}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, H)}
            colors={['#F5EEDF', '#F1E9D6', '#ECE1CB']}
          />
        </Rect>

        {/* Halo terre de Sienne en haut */}
        <Circle cx={W / 2} cy={H * 0.15} r={W * 0.78}>
          <RadialGradient
            c={vec(W / 2, H * 0.15)}
            r={W * 0.78}
            colors={[
              'rgba(166,75,36,0.30)',
              'rgba(200,140,80,0.10)',
              'rgba(241,233,214,0)',
            ]}
          />
        </Circle>

        {/* Reflet symétrique en bas */}
        <Circle cx={W / 2} cy={H * 0.92} r={W * 0.72}>
          <RadialGradient
            c={vec(W / 2, H * 0.92)}
            r={W * 0.72}
            colors={['rgba(166,75,36,0.14)', 'rgba(241,233,214,0)']}
          />
        </Circle>
      </Canvas>

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            {/* Logo harmonisé (sienne sur crème). Pour revenir à l'icône
                d'origine bleue : require('../../assets/icon.png'). */}
            <Image
              source={require('../../assets/welcome-logo.png')}
              style={styles.logo}
            />
          </View>
          <Text style={styles.title}>ComClic</Text>
          <Text style={styles.kicker}>
            Commentez vos photos, sauvegardez ou partagez-les
          </Text>
        </View>

        <Pressable style={styles.cta} onPress={onEnter}>
          <Text style={styles.ctaText}>Commencer</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    marginBottom: 30,
  },
  logo: {
    width: 108,
    height: 108,
    borderRadius: 26,
  },
  kicker: {
    fontFamily: F.monoBold,
    fontSize: 19,
    lineHeight: 27,
    letterSpacing: 0.3,
    color: C.sienna,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  title: {
    fontFamily: F.display,
    fontSize: 46,
    letterSpacing: 2,
    color: C.ink,
    textAlign: 'center',
  },
  cta: {
    width: '100%',
    height: 54,
    borderRadius: 16,
    backgroundColor: C.sienna,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: F.monoBold,
    fontSize: 16,
    letterSpacing: 1,
    color: '#F6EFE0',
  },
});

import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';
import { useLang } from '../i18n';
import {
  TRIAL_ALBUMS,
  TRIAL_PHOTOS,
  useEntitlement,
  type PaywallReason,
  type ProductKey,
} from '../purchases';

/** Prix affichés tant que la boutique n'a pas répondu (hors ligne). */
const FALLBACK_PRICES: Record<ProductKey, string> = {
  light: '7,99 €',
  full: '12,99 €',
  upgrade: '5,00 €',
};

/**
 * Écran d'achat : version Light et version complète côte à côte (prix de la
 * boutique, localisés), « Restaurer mes achats » (exigé par Apple), rappel de
 * l'essai. Paiement unique, sans abonnement. Pour un client Light, seule la
 * montée en version complète est proposée.
 */
export function PaywallModal({
  reason,
  onClose,
}: {
  reason: PaywallReason | null;
  onClose: () => void;
}) {
  const { L } = useLang();
  const P = L.paywall;
  const insets = useSafeAreaInsets();
  const { tier, prices, buy, restore, redeemCode, busy, trialAlbumsUsed } = useEntitlement();
  const price = (k: ProductKey) => prices[k] ?? FALLBACK_PRICES[k];

  const lead =
    reason === 'quota'
      ? P.leadQuota(TRIAL_ALBUMS)
      : reason === 'tooManyPhotos'
        ? P.leadTooManyPhotos(TRIAL_PHOTOS)
        : reason === 'feature'
          ? P.leadFeature
          : tier === 'light'
            ? P.leadUpgrade
            : P.leadMenu;

  return (
    <Modal visible={reason !== null} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={L.common.close}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <Image source={require('../../assets/logo-mark.png')} style={styles.logo} />
          <Text style={styles.title}>{tier === 'light' ? P.titleUpgrade : P.title}</Text>
          <Text style={styles.lead}>{lead}</Text>
          {tier === 'trial' && (
            <Text style={styles.trial}>{P.trialStatus(trialAlbumsUsed, TRIAL_ALBUMS, TRIAL_PHOTOS)}</Text>
          )}

          {tier === 'trial' && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>ComClic Light</Text>
                <Text style={styles.cardPrice}>{price('light')}</Text>
              </View>
              {P.lightFeatures.map((f) => (
                <Feature key={f} text={f} />
              ))}
              <Pressable
                style={[styles.btn, styles.btnGhost, busy && styles.disabled]}
                disabled={busy}
                onPress={() => buy('light')}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>{P.buyLight(price('light'))}</Text>
              </Pressable>
            </View>
          )}

          <View style={[styles.card, styles.cardFull]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{P.recommended}</Text>
            </View>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>ComClic Full</Text>
              <Text style={styles.cardPrice}>
                {tier === 'light' ? `+ ${price('upgrade')}` : price('full')}
              </Text>
            </View>
            <Text style={styles.cardIntro}>{P.fullIntro}</Text>
            {P.fullFeatures.map((f) => (
              <Feature key={f} text={f} strong />
            ))}
            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.disabled]}
              disabled={busy}
              onPress={() => buy(tier === 'light' ? 'upgrade' : 'full')}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={C.paper} />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {tier === 'light' ? P.buyUpgrade(price('upgrade')) : P.buyFull(price('full'))}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.oneTime}>{P.oneTime}</Text>
          <View style={styles.links}>
            <Pressable onPress={restore} disabled={busy} hitSlop={8} accessibilityRole="button">
              <Text style={styles.restore}>{P.restore}</Text>
            </Pressable>
            <Text style={styles.linkSep}>·</Text>
            {/* Code offert (ami, client, influenceur) : codes officiels des
                boutiques, seule voie autorisée pour débloquer une fonction payante. */}
            <Pressable onPress={redeemCode} disabled={busy} hitSlop={8} accessibilityRole="button">
              <Text style={styles.restore}>{P.redeem}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Feature({ text, strong = false }: { text: string; strong?: boolean }) {
  return (
    <View style={styles.feature}>
      <Ionicons name="checkmark-circle" size={18} color={strong ? C.sienna : C.muted} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  header: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 4 },
  close: { fontFamily: F.mono, fontSize: 20, color: C.ink },
  body: { paddingHorizontal: 20, alignItems: 'stretch', gap: 14 },
  logo: { width: 56, height: 56, alignSelf: 'center', resizeMode: 'contain' },
  title: { fontFamily: F.display, fontSize: 26, color: C.ink, textAlign: 'center' },
  lead: { fontFamily: F.mono, fontSize: 15, lineHeight: 21, color: C.inkSoft, textAlign: 'center' },
  trial: {
    fontFamily: F.monoBold,
    fontSize: 12.5,
    color: C.sienna,
    textAlign: 'center',
    backgroundColor: 'rgba(166,75,36,0.10)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    gap: 8,
  },
  cardFull: { borderColor: C.sienna, borderWidth: 2 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: C.sienna,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontFamily: F.monoBold, fontSize: 11, color: C.paper, letterSpacing: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { fontFamily: F.display, fontSize: 19, color: C.ink },
  cardPrice: { fontFamily: F.monoBold, fontSize: 18, color: C.ink },
  cardIntro: { fontFamily: F.mono, fontSize: 13, color: C.muted },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureText: { flex: 1, fontFamily: F.mono, fontSize: 14, lineHeight: 19, color: C.ink },
  btn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnPrimary: { backgroundColor: C.ink },
  btnPrimaryText: { fontFamily: F.monoBold, fontSize: 15, color: C.paper },
  btnGhost: { backgroundColor: C.tan },
  btnGhostText: { fontFamily: F.monoBold, fontSize: 15, color: C.ink },
  disabled: { opacity: 0.5 },
  oneTime: { fontFamily: F.mono, fontSize: 12.5, color: C.muted, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  linkSep: { fontFamily: F.mono, fontSize: 14, color: C.muted },
  restore: {
    fontFamily: F.monoBold,
    fontSize: 14,
    color: C.sienna,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { ExportOptions } from './types';
import { useLang } from './i18n';
import { PaywallModal } from './components/PaywallModal';

/**
 * Achats intégrés (App Store / Google Play), **sans serveur** : StoreKit 2 et
 * Play Billing vérifient les achats sur l'appareil (`expo-iap`), l'app n'envoie
 * rien nulle part.
 *
 * Trois niveaux :
 * - **essai** (téléchargement gratuit) : fonctions de la version Light, et
 *   partage de **3 albums** de **15 photos** au plus ;
 * - **Light** (7,99 €, achat unique) : albums illimités, mêmes fonctions ;
 * - **Full** (12,99 €, ou Light + passage à 4,99 €) : tout, dont le rapport
 *   professionnel, la sauvegarde, les formats 16 × 21 / 16 × 16, les
 *   couvertures montées, les cartes, les typographies et l'annotation.
 * Les 18 couleurs de fond et « Powered by ComClic » sont dans tous les niveaux.
 *
 * ⚠️ Sans module d'achat (build antérieur, Expo Go) l'app reste **entièrement
 * débloquée** : une mise à jour à distance atteint aussi les anciens builds, qui
 * n'auraient aucun moyen de payer.
 */

export type Tier = 'trial' | 'light' | 'full';
export type ProductKey = 'light' | 'full' | 'upgrade';

/** Identifiants des produits, identiques dans App Store Connect et la Play Console. */
export const PRODUCT_IDS: Record<ProductKey, string> = {
  light: 'comclic.light',
  full: 'comclic.full',
  upgrade: 'comclic.upgrade',
};

/** Essai : albums différents qu'on peut partager, et photos par album. */
export const TRIAL_ALBUMS = 3;
export const TRIAL_PHOTOS = 15;

/** Raison d'ouverture de l'écran d'achat (texte d'accroche). */
export type PaywallReason = 'feature' | 'quota' | 'tooManyPhotos' | 'menu';

export type ShareCheck = 'ok' | 'quota' | 'tooManyPhotos';

interface Entitlement {
  tier: Tier;
  isFull: boolean;
  /** Module d'achat présent (sinon tout est débloqué). */
  storeAvailable: boolean;
  /** Prix localisés des produits (« 7,99 € »), quand la boutique les a donnés. */
  prices: Partial<Record<ProductKey, string>>;
  /**
   * État de la boutique : produits chargés, aucun produit renvoyé (pas encore
   * prêts dans App Store Connect / Play Console), ou erreur (avec son détail).
   */
  storeStatus: 'loading' | 'ready' | 'noProducts' | 'error';
  storeDetail: string | null;
  /** Albums déjà partagés pendant l'essai. */
  trialAlbumsUsed: number;
  canShare: (albumId: string, photoCount: number) => ShareCheck;
  recordShare: (albumId: string) => void;
  buy: (key: ProductKey) => void;
  restore: () => void;
  /**
   * Code promotionnel (ami, client, influenceur) : fenêtre officielle d'Apple,
   * ou page d'utilisation de code du Play Store. Le déblocage arrive ensuite
   * comme un achat (écouteur d'achats, ou relecture au retour dans l'app).
   */
  redeemCode: () => void;
  busy: boolean;
  /**
   * Ouvre l'écran d'achat. `afterModal` : laisse le temps à un écran modal en
   * cours de se fermer (iOS ne superpose pas deux modaux).
   */
  openPaywall: (reason: PaywallReason, afterModal?: boolean) => void;
}

const EntitlementContext = createContext<Entitlement | null>(null);

export function useEntitlement(): Entitlement {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement hors de EntitlementProvider');
  return ctx;
}

/**
 * Options réellement rendues selon le niveau : hors version Full, les réglages
 * réservés (enregistrés avant l'achat, ou venus d'une autre version) retombent
 * sur ceux de la version Light.
 */
export function entitledOptions(options: ExportOptions, isFull: boolean): ExportOptions {
  if (isFull) return options;
  return {
    ...options,
    style: 'family',
    format: 'a4',
    cover: 'classic',
    typeface: 'sans',
    showMap: false,
    photoMaps: false,
  };
}

/** Détail lisible d'une erreur de boutique (code, sinon message). */
function errorDetail(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  return String(err?.code || err?.message || e || '?').slice(0, 160);
}

/** Niveau déduit des produits possédés. */
function tierOf(owned: Set<string>): Tier {
  if (owned.has(PRODUCT_IDS.full)) return 'full';
  if (owned.has(PRODUCT_IDS.light) && owned.has(PRODUCT_IDS.upgrade)) return 'full';
  if (owned.has(PRODUCT_IDS.light)) return 'light';
  return 'trial';
}

/* --------------------------------------------------------------------------
 * Stockage : trousseau iOS / Keystore Android (survit à une désinstallation
 * sur iOS : l'essai ne se renouvelle pas en réinstallant), AsyncStorage à défaut.
 * ------------------------------------------------------------------------ */

const KEY_OWNED = 'comclic.owned';
const KEY_TRIAL = 'comclic.trialAlbums';

type Store = {
  get: (k: string) => Promise<string | null>;
  set: (k: string, v: string) => Promise<void>;
};

function makeStore(): Store {
  try {
    if (requireOptionalNativeModule('ExpoSecureStore')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
      return {
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) => SecureStore.setItemAsync(k, v),
      };
    }
  } catch {
    // module absent : repli ci-dessous
  }
  return { get: (k) => AsyncStorage.getItem(k), set: (k, v) => AsyncStorage.setItem(k, v) };
}

async function readList(store: Store, key: string): Promise<string[]> {
  try {
    const raw = await store.get(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Module d'achat, s'il est compilé dans ce build. */
function loadIap(): typeof import('expo-iap') | null {
  try {
    if (!requireOptionalNativeModule('ExpoIap')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-iap') as typeof import('expo-iap');
  } catch {
    return null;
  }
}

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { L } = useLang();
  const iap = useMemo(loadIap, []);
  const store = useMemo(makeStore, []);
  const storeAvailable = !!iap;

  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [trialAlbums, setTrialAlbums] = useState<string[]>([]);
  const [prices, setPrices] = useState<Partial<Record<ProductKey, string>>>({});
  const [storeStatus, setStoreStatus] = useState<Entitlement['storeStatus']>('loading');
  const [storeDetail, setStoreDetail] = useState<string | null>(null);
  const pricesRef = useRef(prices);
  pricesRef.current = prices;
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  // Lecture du cache local d'abord : l'app marche hors ligne.
  useEffect(() => {
    (async () => {
      setOwned(new Set(await readList(store, KEY_OWNED)));
      setTrialAlbums(await readList(store, KEY_TRIAL));
    })();
  }, [store]);

  const saveOwned = useCallback(
    (next: Set<string>) => {
      setOwned(new Set(next));
      store.set(KEY_OWNED, JSON.stringify([...next])).catch(() => {});
    },
    [store],
  );

  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  // Textes à jour pour les écouteurs posés une fois (langue changée entre-temps).
  const Lref = useRef(L);
  Lref.current = L;

  /** Charge produits et prix ; renvoie les prix trouvés (vide si aucun produit). */
  const loadProducts = useCallback(async (): Promise<Partial<Record<ProductKey, string>>> => {
    if (!iap) return {};
    try {
      const products = await iap.fetchProducts({
        skus: Object.values(PRODUCT_IDS),
        type: 'in-app',
      });
      const byId: Partial<Record<ProductKey, string>> = {};
      for (const p of (products ?? []) as { id: string; displayPrice: string }[]) {
        const key = (Object.keys(PRODUCT_IDS) as ProductKey[]).find((k) => PRODUCT_IDS[k] === p.id);
        if (key) byId[key] = p.displayPrice;
      }
      setPrices(byId);
      const found = Object.keys(byId).length;
      setStoreStatus(found ? 'ready' : 'noProducts');
      setStoreDetail(found ? null : `0/${Object.keys(PRODUCT_IDS).length}`);
      return byId;
    } catch (e) {
      setStoreStatus('error');
      setStoreDetail(errorDetail(e));
      return {};
    }
  }, [iap]);

  /** Relit les achats auprès de la boutique (restauration, lancement). */
  const syncPurchases = useCallback(async (): Promise<Set<string>> => {
    if (!iap) return ownedRef.current;
    const purchases = await iap.getAvailablePurchases();
    // On ne retire jamais un achat connu sur une réponse vide (hors ligne, compte
    // de boutique changé…) : on ajoute seulement.
    const next = new Set(ownedRef.current);
    for (const p of purchases ?? []) {
      if (p.purchaseState === 'pending') continue;
      next.add(p.productId);
      // Android : un achat non « accusé » sous 3 jours est remboursé par Google.
      // Un code utilisé dans le Play Store arrive ici, app fermée entre-temps.
      const acknowledged = (p as { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid;
      if (Platform.OS === 'android' && acknowledged === false) {
        iap.finishTransaction({ purchase: p, isConsumable: false }).catch(() => {});
      }
    }
    ownedRef.current = next;
    saveOwned(next);
    return next;
  }, [iap, saveOwned]);

  // Connexion à la boutique, prix, écoute des achats.
  useEffect(() => {
    if (!iap) return;
    let alive = true;
    const onPurchase = iap.purchaseUpdatedListener(async (purchase) => {
      if (purchase.purchaseState === 'pending') return; // paiement différé (Android)
      try {
        await iap.finishTransaction({ purchase, isConsumable: false });
      } catch {
        // déjà finalisée : sans conséquence
      }
      const next = new Set(ownedRef.current);
      next.add(purchase.productId);
      ownedRef.current = next;
      saveOwned(next);
      setBusy(false);
      setPaywall(null);
      const T = Lref.current.paywall;
      Alert.alert(T.thanksTitle, T.thanksBody(tierOf(next) === 'full'));
    });
    const onError = iap.purchaseErrorListener((error) => {
      setBusy(false);
      const code = String((error as { code?: string }).code ?? '');
      if (code === 'user-cancelled') return;
      if (code === 'already-owned') {
        syncPurchases().catch(() => {});
        return;
      }
      // Le code de la boutique est affiché : sans lui, impossible de savoir ce
      // qui bloque (produit non prêt, compte, réseau…).
      const T = Lref.current.paywall;
      Alert.alert(T.errorTitle, `${T.errorBody}\n\n${T.errorCode(code || '?')}`);
    });
    (async () => {
      try {
        await iap.initConnection();
      } catch (e) {
        if (alive) {
          setStoreStatus('error');
          setStoreDetail(errorDetail(e));
        }
        return;
      }
      await loadProducts();
      syncPurchases().catch(() => {});
    })();
    return () => {
      alive = false;
      onPurchase.remove();
      onError.remove();
      iap.endConnection().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iap]);

  const tier: Tier = storeAvailable ? tierOf(owned) : 'full';
  const isFull = tier === 'full';

  const canShare = useCallback(
    (albumId: string, photoCount: number): ShareCheck => {
      if (tier !== 'trial') return 'ok';
      if (photoCount > TRIAL_PHOTOS) return 'tooManyPhotos';
      if (trialAlbums.includes(albumId) || trialAlbums.length < TRIAL_ALBUMS) return 'ok';
      return 'quota';
    },
    [tier, trialAlbums],
  );

  const recordShare = useCallback(
    (albumId: string) => {
      if (tier !== 'trial') return;
      setTrialAlbums((prev) => {
        if (prev.includes(albumId)) return prev;
        const next = [...prev, albumId];
        store.set(KEY_TRIAL, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [tier, store],
  );

  const buy = useCallback(
    (key: ProductKey) => {
      if (!iap) return;
      setBusy(true);
      const sku = PRODUCT_IDS[key];
      (async () => {
        // La boutique doit connaître le produit avant l'achat : nouvel essai de
        // chargement s'il manque (produit rendu disponible entre-temps).
        if (!pricesRef.current[key] && !(await loadProducts())[key]) {
          setBusy(false);
          const T = Lref.current.paywall;
          Alert.alert(T.errorTitle, `${T.productMissing(sku)}\n\n${T.errorCode('product-not-found')}`);
          return;
        }
        try {
          await iap.requestPurchase({
            request: { apple: { sku }, google: { skus: [sku] } },
            type: 'in-app',
          });
        } catch (e) {
          // Erreur levée sans passer par l'écouteur d'erreurs : on la montre aussi.
          setBusy(false);
          const detail = errorDetail(e);
          if (!/cancel/i.test(detail)) {
            const T = Lref.current.paywall;
            Alert.alert(T.errorTitle, `${T.errorBody}\n\n${T.errorCode(detail)}`);
          }
        }
      })();
    },
    [iap, loadProducts],
  );

  // Retour dans l'app (après un code utilisé dans le Play Store ou l'App Store) :
  // relecture des achats, et remerciement si un niveau vient d'être débloqué.
  useEffect(() => {
    if (!iap) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const before = tierOf(ownedRef.current);
      syncPurchases()
        .then((now) => {
          const after = tierOf(now);
          if (after !== before && after !== 'trial') {
            setPaywall(null);
            const T = Lref.current.paywall;
            Alert.alert(T.thanksTitle, T.thanksBody(after === 'full'));
          }
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [iap, syncPurchases]);

  const redeemCode = useCallback(() => {
    if (!iap) return;
    (async () => {
      try {
        if (Platform.OS === 'ios') await iap.presentCodeRedemptionSheetIOS();
        else await iap.openRedeemOfferCodeAndroid();
      } catch {
        Alert.alert(Lref.current.paywall.errorTitle, Lref.current.paywall.redeemFail);
      }
    })();
  }, [iap]);

  const restore = useCallback(() => {
    if (!iap) return;
    setBusy(true);
    (async () => {
      try {
        await iap.restorePurchases();
        const now = tierOf(await syncPurchases());
        Alert.alert(
          L.paywall.restoredTitle,
          now === 'trial' ? L.paywall.restoredNone : L.paywall.restoredBody(now === 'full'),
        );
        if (now !== 'trial') setPaywall(null);
      } catch {
        Alert.alert(L.paywall.errorTitle, L.paywall.errorBody);
      } finally {
        setBusy(false);
      }
    })();
  }, [iap, syncPurchases, L]);

  const openPaywall = useCallback(
    (reason: PaywallReason, afterModal = false) => {
      // Produits pas encore chargés (boutique pas prête au lancement) : nouvel essai.
      if (iap && !Object.keys(pricesRef.current).length) loadProducts().catch(() => {});
      if (afterModal) setTimeout(() => setPaywall(reason), 450);
      else setPaywall(reason);
    },
    [iap, loadProducts],
  );

  const value = useMemo<Entitlement>(
    () => ({
      tier,
      isFull,
      storeAvailable,
      prices,
      storeStatus,
      storeDetail,
      trialAlbumsUsed: trialAlbums.length,
      canShare,
      recordShare,
      buy,
      restore,
      redeemCode,
      busy,
      openPaywall,
    }),
    [
      tier,
      isFull,
      storeAvailable,
      prices,
      storeStatus,
      storeDetail,
      trialAlbums.length,
      canShare,
      recordShare,
      buy,
      restore,
      redeemCode,
      busy,
      openPaywall,
    ],
  );

  return (
    <EntitlementContext.Provider value={value}>
      {children}
      <PaywallModal reason={paywall} onClose={() => setPaywall(null)} />
    </EntitlementContext.Provider>
  );
}

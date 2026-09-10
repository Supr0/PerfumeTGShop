import { useEffect, useState } from 'react';
import { authHeaders, initTma } from './lib/tma';
import uk from './i18n/uk.json';
import ru from './i18n/ru.json';
import { Home } from './pages/Home';
import { ProductPage } from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import Favorites from './pages/Favorites';
import Admin from './pages/Admin';

type Locale = 'uk' | 'ru';
type Tab = 'catalog' | 'cart' | 'orders' | 'favorites' | 'admin';

const LOCALE_KEY = 'freshdoze:locale';
const TABS: Tab[] = ['catalog', 'cart', 'orders', 'favorites'];
const ADMIN_ME_URL = '/v1/admin/me';
const STRINGS: Record<Locale, Record<string, string>> = { uk, ru };

export type RouteName = 'catalog' | 'product' | 'cart' | 'checkout' | 'orders' | 'favorites' | 'admin';

export interface Route {
  name: RouteName;
  productId?: number;
}

/** Minimal hash routing (no router dep): #/ #/product/:id #/cart #/checkout #/orders #/favorites #/admin. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const productMatch = path.match(/^\/product\/(\d+)$/);
  if (productMatch) return { name: 'product', productId: Number(productMatch[1]) };
  switch (path) {
    case '/':
    case '':
      return { name: 'catalog' };
    case '/cart':
      return { name: 'cart' };
    case '/checkout':
      return { name: 'checkout' };
    case '/orders':
      return { name: 'orders' };
    case '/favorites':
      return { name: 'favorites' };
    case '/admin':
      return { name: 'admin' };
    default:
      return { name: 'catalog' };
  }
}

function routeToTab(route: Route): Tab {
  switch (route.name) {
    case 'cart':
    case 'checkout':
      return 'cart';
    case 'orders':
      return 'orders';
    case 'favorites':
      return 'favorites';
    case 'admin':
      return 'admin';
    case 'product':
    case 'catalog':
    default:
      return 'catalog';
  }
}

function tabToHash(tab: Tab): string {
  switch (tab) {
    case 'catalog':
      return '#/';
    case 'cart':
      return '#/cart';
    case 'orders':
      return '#/orders';
    case 'favorites':
      return '#/favorites';
    case 'admin':
      return '#/admin';
  }
}

function loadLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'ru' ? 'ru' : 'uk';
  } catch {
    return 'uk';
  }
}

function LocaleSwitcher({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const persist = (next: Locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // storage unavailable — locale still applies for this session.
    }
    onChange(next);
  };
  return (
    <div className="fd-locale-switch" role="group" aria-label="Language">
      {(['uk', 'ru'] as Locale[]).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => persist(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function TabBar({ tabs, tab, onChange, t }: { tabs: Tab[]; tab: Tab; onChange: (t: Tab) => void; t: (k: string) => string }) {
  return (
    <nav className="fd-tabbar" role="navigation" aria-label="Tabs">
      {tabs.map((id) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onChange(id)}>
          {t(id)}
        </button>
      ))}
    </nav>
  );
}

function readRoute(): Route {
  try {
    return parseHash(window.location.hash);
  } catch {
    return { name: 'catalog' };
  }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const [route, setRoute] = useState<Route>(readRoute);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    initTma();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ADMIN_ME_URL, { headers: { ...authHeaders() } });
        if (!cancelled && res.status === 200) setIsAdmin(true);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const t = (key: string): string => STRINGS[locale][key] ?? key;
  const visibleTabs: Tab[] = isAdmin ? [...TABS, 'admin'] : TABS;
  const tab = routeToTab(route);

  return (
    <div className="fd-app">
      <header className="fd-header">
        <span className="fd-logo">FreshDoze</span>
        <LocaleSwitcher locale={locale} onChange={setLocale} />
      </header>
      <main className="fd-main">
        {route.name === 'catalog' && <Home locale={locale} />}
        {route.name === 'product' && route.productId != null && (
          <ProductPage key={route.productId} productId={route.productId} locale={locale} />
        )}
        {route.name === 'cart' && <Cart locale={locale} />}
        {route.name === 'checkout' && <Checkout locale={locale} />}
        {route.name === 'orders' && <Orders locale={locale} />}
        {route.name === 'favorites' && <Favorites locale={locale} />}
        {route.name === 'admin' && <Admin locale={locale} />}
      </main>
      <TabBar
        tabs={visibleTabs}
        tab={tab}
        onChange={(next) => {
          window.location.hash = tabToHash(next);
          setRoute(parseHash(tabToHash(next)));
        }}
        t={t}
      />
    </div>
  );
}

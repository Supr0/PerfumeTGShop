import { useEffect, useState } from 'react';
import { initTma } from './lib/tma';
import uk from './i18n/uk.json';
import ru from './i18n/ru.json';

type Locale = 'uk' | 'ru';
type Tab = 'catalog' | 'cart' | 'orders' | 'favorites';

const LOCALE_KEY = 'freshdoze:locale';
const TABS: Tab[] = ['catalog', 'cart', 'orders', 'favorites'];
const STRINGS: Record<Locale, Record<string, string>> = { uk, ru };

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

function TabBar({ tab, onChange, t }: { tab: Tab; onChange: (t: Tab) => void; t: (k: string) => string }) {
  return (
    <nav className="fd-tabbar" role="navigation" aria-label="Tabs">
      {TABS.map((id) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onChange(id)}>
          {t(id)}
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(loadLocale);
  const [tab, setTab] = useState<Tab>('catalog');

  useEffect(() => {
    initTma();
  }, []);

  const t = (key: string): string => STRINGS[locale][key] ?? key;

  return (
    <div className="fd-app">
      <header className="fd-header">
        <span className="fd-logo">FreshDoze</span>
        <LocaleSwitcher locale={locale} onChange={setLocale} />
      </header>
      <main className="fd-main">
        <h1>{t(tab)}</h1>
        <p>{t('thank_you')}</p>
      </main>
      <TabBar tab={tab} onChange={setTab} t={t} />
    </div>
  );
}

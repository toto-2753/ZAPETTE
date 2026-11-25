import { useMemo } from 'react';
import { useCatalog } from '../data/catalog';
import { categoryLabel, countryFlag, countryName, formatInt, languageName } from '../data/labels';
import { settingsStore } from '../lib/stores';
import { navigate, usePageRoute } from '../router';
import { Grid } from '../components/Channel';
import { PageHead } from '../components/Layout';
import { EmptyState } from '../components/ui';
import { LoadError, Skeleton } from './states';

function countBy<T>(list: T[], keys: (x: T) => (string | undefined)[]) {
  const m = new Map<string, number>();
  for (const x of list) for (const k of keys(x)) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Channels() {
  const { status, visible, error, reload } = useCatalog();
  const settings = settingsStore.use();
  const { params } = usePageRoute();
  const country = params.get('pays') ?? settings.country;
  const cat = params.get('cat') ?? '';
  const lang = params.get('langue') ?? '';

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    navigate(`/chaines?${p}`, { replace: true });
  };

  const countries = useMemo(() => countBy(visible, (c) => [c.c]), [visible]);
  const inCountry = useMemo(() => (country === 'all' ? visible : visible.filter((c) => c.c === country)), [visible, country]);
  const languages = useMemo(() => countBy(inCountry, (c) => c.lg ?? []).slice(0, 40), [inCountry]);
  const inLang = useMemo(() => (lang ? inCountry.filter((c) => c.lg?.includes(lang)) : inCountry), [inCountry, lang]);
  const categories = useMemo(() => countBy(inLang, (c) => c.g), [inLang]);
  const items = useMemo(() => (cat ? inLang.filter((c) => c.g.includes(cat)) : inLang), [inLang, cat]);

  if (status === 'loading') return <Skeleton />;
  if (status === 'error') return <LoadError message={error} onRetry={reload} />;

  return (
    <div className="page">
      <PageHead title="Chaînes">
        <p className="page-count">{formatInt(items.length)} chaînes</p>
      </PageHead>
      <div className="filters">
        <label className="select">
          <span>Pays</span>
          <select value={country} onChange={(e) => setParam('pays', e.target.value)}>
            <option value="all">Tous les pays ({formatInt(visible.length)})</option>
            {countries.map(([code, n]) => (
              <option key={code} value={code}>
                {countryFlag(code)} {countryName(code)} ({n})
              </option>
            ))}
          </select>
        </label>
        <label className="select">
          <span>Langue</span>
          <select value={lang} onChange={(e) => setParam('langue', e.target.value)}>
            <option value="">Toutes les langues</option>
            {languages.map(([code, n]) => (
              <option key={code} value={code}>
                {languageName(code)} ({n})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chips" role="group" aria-label="Catégories">
        <button type="button" className="chip" aria-pressed={!cat} onClick={() => setParam('cat', '')}>
          Toutes
        </button>
        {categories.map(([id, n]) => (
          <button type="button" key={id} className="chip" aria-pressed={cat === id} onClick={() => setParam('cat', cat === id ? '' : id)}>
            {categoryLabel(id)} <span className="chip-n">{n}</span>
          </button>
        ))}
      </div>
      {items.length ? (
        <Grid items={items} />
      ) : (
        <EmptyState icon="tv" title="Aucune chaîne avec ces filtres">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/chaines?pays=all', { replace: true })}>
            Voir toutes les chaînes
          </button>
        </EmptyState>
      )}
    </div>
  );
}

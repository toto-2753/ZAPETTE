import { useMemo, useState, useSyncExternalStore } from 'react';
import { useCatalog } from '../data/catalog';
import { countryFlag, countryName, formatInt, LANGUAGE_CHOICES, languageName, timeAgo } from '../data/labels';
import { deadStore, DEFAULT_SETTINGS, favoritesStore, historyStore, settingsStore, type Settings as S } from '../lib/stores';
import { isAndroid, isIOS, isStandalone } from '../lib/platform';
import { copyText } from '../lib/share';
import { getInstallPrompt, subscribeInstall } from '../lib/install';
import { PageHead } from '../components/Layout';
import { Icon } from '../components/Icon';
import { TmdbSetup } from '../components/Media';
import { Toggle, toast } from '../components/ui';

export default function Settings() {
  const { catalog, all, hiddenCount, reload, isPrivate, playlistDir, lockDevice } = useCatalog();
  const settings = settingsStore.use();
  const dead = deadStore.use();
  const set = <K extends keyof S>(k: K, v: S[K]) => settingsStore.set((s) => ({ ...s, [k]: v }));
  const countries = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of all) if (c.c) m.set(c.c, (m.get(c.c) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), 'fr'));
  }, [all]);
  const deadCount = Object.keys(dead).length;
  const playlist = (name: string) => new URL(`./${playlistDir}/${name}`, location.href).href;

  return (
    <div className="page page-narrow settings">
      <PageHead title="Réglages" />

      <section className="panel">
        <h2>État des chaînes</h2>
        {catalog ? (
          <>
            <p className="big-stat">
              {formatInt(catalog.stats.channels)} <span>chaînes en ligne</span>
            </p>
            {catalog.checked ? (
              <ul className="facts">
                <li>Vérification {timeAgo(catalog.generatedAt)}, refaite automatiquement toutes les 6 heures.</li>
                <li>
                  {formatInt(catalog.stats.tested)} liens testés : {formatInt(catalog.stats.alive)} en ligne, {formatInt(catalog.stats.dead)} morts
                  écartés.
                </li>
                <li>
                  {formatInt(catalog.stats.restricted)} liens refusés depuis les serveurs de vérification (souvent un blocage par pays) : gardés et
                  testés sur ton appareil.
                </li>
              </ul>
            ) : (
              <p className="muted">Liste de développement, pas encore vérifiée.</p>
            )}
            <p>
              Masquées sur cet appareil car injoignables : {formatInt(hiddenCount)} chaînes ({formatInt(deadCount)} liens). Elles reviennent seules
              après 6 heures.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={reload}>
                <Icon name="refresh" size={18} /> Recharger la liste
              </button>
              {deadCount > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    deadStore.set({});
                    toast('Toutes les chaînes masquées sont réaffichées.');
                  }}
                >
                  Réafficher les chaînes masquées
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="muted">Chargement…</p>
        )}
      </section>

      {isPrivate && (
        <section className="panel">
          <h2>Accès privé</h2>
          <p>
            Cette Zapette est protégée par un mot de passe : sans lui, la liste des chaînes est illisible. Pour retirer l’accès à quelqu’un,
            change le mot de passe (secret <code>ZAPETTE_PASSWORD</code> du dépôt GitHub) et donne le nouveau aux autres.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={lockDevice}>
              <Icon name="close" size={18} /> Verrouiller cet appareil
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Préférences</h2>
        <div className="field-grid">
          <label className="select">
            <span>Pays de référence</span>
            <select value={settings.country} onChange={(e) => set('country', e.target.value)}>
              {countries.map(([code, n]) => (
                <option key={code} value={code}>
                  {countryFlag(code)} {countryName(code)} ({n})
                </option>
              ))}
            </select>
          </label>
          <label className="select">
            <span>Langue préférée</span>
            <select value={settings.lang} onChange={(e) => set('lang', e.target.value)}>
              {LANGUAGE_CHOICES.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">Le pays décide de la numérotation : en France, les chaînes de la TNT gardent leur numéro habituel.</p>
        <Toggle
          label="Vérifier les chaînes en arrière-plan"
          hint="Teste discrètement les chaînes affichées et masque celles qui ne répondent pas. Désactivé en mode économie de données."
          checked={settings.probe}
          onChange={(v) => set('probe', v)}
        />
        <Toggle
          label="Aperçu vidéo sur l’accueil"
          hint="Sur ordinateur, la chaîne du bandeau joue sans le son."
          checked={settings.heroPreview}
          onChange={(v) => set('heroPreview', v)}
        />
        <Toggle
          label="Montrer les chaînes lisibles seulement dans VLC"
          hint="Certains serveurs bloquent la lecture dans un navigateur. Ces chaînes s’ouvrent alors dans l’app VLC."
          checked={settings.showExternal}
          onChange={(v) => set('showExternal', v)}
        />
      </section>

      <InstallPanel />

      <section className="panel">
        <h2>Regarder sur la télé</h2>
        <ul className="facts">
          <li>
            <strong>Chromecast</strong> : depuis Chrome ou Edge (ordinateur, Android), bouton <Icon name="cast" size={16} /> dans le lecteur.
          </li>
          <li>
            <strong>AirPlay</strong> : depuis Safari (iPhone, iPad, Mac), bouton <Icon name="airplay" size={16} /> vers une Apple TV ou une TV
            compatible AirPlay (Samsung, LG, Sony récentes…).
          </li>
          <li>
            <strong>Smart TV</strong> : ouvre l’adresse de Zapette dans le navigateur de la TV, ou charge une playlist vérifiée dans une app IPTV
            (TiviMate, IPTV Smarters, VLC…).{isPrivate ? ' Ces liens sont secrets : ne les partage qu’avec les personnes invitées.' : ''}
          </li>
        </ul>
        <div className="copy-list">
          {[
            ['zapette-fr.m3u', 'Playlist France et francophone'],
            ['zapette.m3u', 'Playlist complète'],
          ].map(([file, label]) => (
            <div className="copy-item" key={file}>
              <span>
                {label}
                <small>{playlist(file)}</small>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => toast((await copyText(playlist(file))) ? 'Lien copié.' : 'Copie impossible : sélectionne le lien à la main.')}
              >
                <Icon name="copy" size={18} /> Copier
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Nouveautés films et séries</h2>
        {settings.tmdbKey ? (
          <div className="btn-row">
            <p>Clé TMDB enregistrée sur cet appareil.</p>
            <button type="button" className="btn btn-ghost" onClick={() => set('tmdbKey', '')}>
              Retirer la clé
            </button>
          </div>
        ) : (
          <TmdbSetup />
        )}
      </section>

      <ProxyPanel />

      <section className="panel">
        <h2>Données sur cet appareil</h2>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              favoritesStore.set([]);
              toast('Ma liste est vidée.');
            }}
          >
            Vider ma liste
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              historyStore.set([]);
              toast('Historique effacé.');
            }}
          >
            Effacer l’historique
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              settingsStore.set(DEFAULT_SETTINGS);
              toast('Réglages remis à zéro.');
            }}
          >
            Réglages par défaut
          </button>
        </div>
      </section>

      <section className="panel about">
        <h2>À propos</h2>
        <p>
          Zapette lit uniquement des chaînes diffusées publiquement et gratuitement sur internet, recensées par le projet libre{' '}
          <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">
            iptv-org
          </a>
          . Elle n’héberge aucune vidéo. Les nouveautés viennent de TMDB et les offres de JustWatch.
        </p>
        <p className="muted small">Une chaîne ne devrait pas être là ? Elle peut être signalée à iptv-org, qui la retire de sa liste.</p>
      </section>
    </div>
  );
}

function InstallPanel() {
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt, getInstallPrompt);
  if (isStandalone) return null;
  return (
    <section className="panel">
      <h2>Installer l’app</h2>
      {prompt ? (
        <>
          <p>Ajoute Zapette à ton écran d’accueil ou à tes applications : elle s’ouvre en plein écran, comme une vraie app.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await prompt.prompt();
            }}
          >
            <Icon name="download" size={18} /> Installer Zapette
          </button>
        </>
      ) : isIOS ? (
        <ol className="steps">
          <li>Ouvre Zapette dans Safari.</li>
          <li>
            Touche <Icon name="share" size={16} /> Partager, puis « Sur l’écran d’accueil ».
          </li>
          <li>Touche « Ajouter » : l’icône Zapette apparaît avec tes apps (iPhone et iPad).</li>
        </ol>
      ) : isAndroid ? (
        <ol className="steps">
          <li>Ouvre Zapette dans Chrome.</li>
          <li>Menu ⋮ puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).</li>
        </ol>
      ) : (
        <ol className="steps">
          <li>Chrome ou Edge : icône d’installation à droite de la barre d’adresse.</li>
          <li>Safari sur Mac : menu Fichier puis « Ajouter au Dock ».</li>
        </ol>
      )}
    </section>
  );
}

function ProxyPanel() {
  const settings = settingsStore.use();
  const [url, setUrl] = useState(settings.proxyUrl);
  const [token, setToken] = useState(settings.proxyToken);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const u = url.trim().replace(/\/+$/, '');
    if (u) {
      setBusy(true);
      try {
        const r = await fetch(`${u}/health${token ? `?t=${encodeURIComponent(token.trim())}` : ''}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status === 403 ? 'Jeton refusé par le proxy' : `Le proxy a répondu ${r.status}`);
      } catch (e) {
        setBusy(false);
        toast((e as Error).message.startsWith('Le proxy') || (e as Error).message.startsWith('Jeton') ? (e as Error).message : 'Proxy injoignable');
        return;
      }
      setBusy(false);
    }
    settingsStore.set((s) => ({ ...s, proxyUrl: u, proxyToken: token.trim() }));
    toast(u ? 'Proxy activé : plus de chaînes deviennent lisibles.' : 'Proxy désactivé.');
  };
  return (
    <section className="panel">
      <h2>Proxy (facultatif)</h2>
      <p>
        Sur PC et Android, un navigateur ne peut pas lire les chaînes dont le serveur interdit la lecture « depuis un autre site ». Un petit proxy
        gratuit (Cloudflare) lève ce blocage. Le guide est dans le dossier <code>proxy/</code> du projet.
      </p>
      <form
        className="field-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="text">
          <span>Adresse du proxy</span>
          <input type="url" placeholder="https://zapette-proxy.pseudo.workers.dev" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
        </label>
        <label className="text">
          <span>Jeton</span>
          <input type="text" placeholder="Le secret choisi à l’installation" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Test…' : url.trim() ? 'Tester et activer' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </section>
  );
}

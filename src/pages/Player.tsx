import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveChannel, PlayableStream } from '../data/types';
import { getZapList, useCatalog } from '../data/catalog';
import { categoryLabel, countryFlag, countryName, languageName, qualityLabel, timeAgo } from '../data/labels';
import { favoritesStore, markAlive, markDead, pushHistory, settingsStore, toggleFavorite } from '../lib/stores';
import { isIOS, isMobile, pipSupported } from '../lib/platform';
import { proxied } from '../lib/proxy';
import { openInVlc } from '../lib/share';
import { Engine, type LevelInfo } from '../player/engine';
import { castMedia, loadCast, stopCasting, watchCastState, type CastState } from '../player/cast';
import { promptRemotePlayback, showAirPlayPicker, watchAirPlay, watchAirPlayActive, watchRemotePlayback } from '../player/airplay';
import { goBack, navigate, watchPath } from '../router';
import { ChannelLogo } from '../components/Channel';
import { Icon } from '../components/Icon';
import { ShareSheet } from '../components/ShareSheet';
import { toast, useMediaQuery } from '../components/ui';

type Panel = null | 'sources' | 'list' | 'info' | 'share';
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitSetPresentationMode?: (m: string) => void };

const streamLabel = (s: PlayableStream, i: number) => {
  const bits = [qualityLabel(s.q) || s.q, s.f, s.lg?.map(languageName).join(', ')].filter(Boolean);
  return { title: `Source ${i + 1}`, bits: bits as string[] };
};

export default function Player({ id }: { id: string }) {
  const { status, byId, visible, catalog } = useCatalog();
  const settings = settingsStore.use();
  const favs = favoritesStore.use();
  const ch = byId.get(id);
  const fine = useMediaQuery('(pointer: fine)');

  const root = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<Engine | null>(null);

  // Ordre des sources figé pour la durée de la chaîne (le marquage « mort » ne doit pas le décaler).
  const [order, setOrder] = useState<PlayableStream[]>([]);
  const [srcIndex, setSrcIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [state, setState] = useState<'loading' | 'playing' | 'error' | 'external'>('loading');
  const [waiting, setWaiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [levels, setLevels] = useState<LevelInfo[]>([]);
  const [level, setLevelState] = useState(-1);
  const [ui, setUi] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [osdShow, setOsdShow] = useState(true);
  const [typed, setTyped] = useState('');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [castState, setCastState] = useState<CastState>('unavailable');
  const [castingTo, setCastingTo] = useState<string | null>(null);
  const [airplay, setAirplay] = useState(false);
  const [airplayOn, setAirplayOn] = useState(false);
  const [remoteOk, setRemoteOk] = useState(false);
  const pausedAt = useRef(0);

  const current = order[srcIndex];
  const externals = useMemo(() => ch?.play.filter((s) => s.mode === 'external') ?? [], [ch]);

  // ---------- Liste de zapping ----------
  const zapList = useMemo<LiveChannel[]>(() => {
    const visibleIds = new Set(visible.map((c) => c.id));
    const fromCtx = getZapList()
      .map((x) => byId.get(x))
      .filter((c): c is LiveChannel => !!c && (visibleIds.has(c.id) || c.id === id));
    if (fromCtx.some((c) => c.id === id)) return fromCtx;
    return visible.some((c) => c.id === id) ? visible : ch ? [...visible, ch].sort((a, b) => a.num - b.num) : visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, id]);
  const zapRef = useRef({ zapList, id });
  zapRef.current = { zapList, id };

  const zap = useCallback((dir: 1 | -1) => {
    const { zapList: l, id: cur } = zapRef.current;
    if (l.length < 2) return;
    const i = l.findIndex((c) => c.id === cur);
    const next = l[(i + dir + l.length) % l.length];
    navigate(watchPath(next.id), { replace: true });
  }, []);

  const goToNumber = useCallback(
    (n: number) => {
      const target = [...byId.values()].find((c) => c.num === n);
      if (target) navigate(watchPath(target.id), { replace: true });
      else toast(`Pas de chaîne sur le ${n}.`);
    },
    [byId],
  );

  // ---------- Changement de chaîne (réinitialisation pendant le rendu, sans image intermédiaire) ----------
  const [orderFor, setOrderFor] = useState<string | null>(null);
  if (ch && orderFor !== ch.id) {
    const playable = ch.play.filter((s) => s.mode !== 'external');
    setOrderFor(ch.id);
    setOrder(playable);
    setSrcIndex(0);
    setFailed(new Set());
    setLevels([]);
    setLevelState(-1);
    setPanel((p) => (p === 'list' ? p : null));
    setState(playable.length ? 'loading' : 'external');
    setOsdShow(true);
  }
  useEffect(() => {
    const t = setTimeout(() => setOsdShow(false), 3500);
    return () => clearTimeout(t);
  }, [ch?.id]);

  // ---------- Lecture de la source courante ----------
  useEffect(() => {
    const video = videoRef.current;
    if (!ch || !video || !current || castingTo) return;
    const s = current;
    const engine = new Engine(video, {
      onPlaying: () => {
        setState('playing');
        markAlive(s.u);
        pushHistory(ch.id);
      },
      onFatal: (reason) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setState('error');
          return;
        }
        markDead(s.u);
        setFailed((f) => new Set(f).add(s.u));
        console.info(`[zapette] ${ch.n} source ${srcIndex + 1} en échec : ${reason}`);
        if (srcIndex + 1 < order.length) {
          toast(`Source ${srcIndex + 1} indisponible, essai de la source ${srcIndex + 2}…`);
          setSrcIndex(srcIndex + 1);
        } else {
          setState('error');
        }
      },
      onLevels: (l) => setLevels(l),
      onWaiting: setWaiting,
      onAutoplayBlocked: () => setSoundBlocked(true),
    });
    engineRef.current = engine;
    setState('loading');
    engine.load(s.u, s.mode, { proxyUrl: settings.proxyUrl, proxyToken: settings.proxyToken });
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.u, ch?.id, castingTo, attempt]);

  // ---------- État de la vidéo ----------
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      setPaused(v.paused);
      setMuted(v.muted);
      setVolume(v.volume);
      if (!v.muted) setSoundBlocked(false);
    };
    const onPause = () => {
      pausedAt.current = Date.now();
      sync();
    };
    const onPlay = () => {
      if (pausedAt.current && Date.now() - pausedAt.current > 10_000) engineRef.current?.goLive();
      pausedAt.current = 0;
      sync();
    };
    v.addEventListener('pause', onPause);
    v.addEventListener('play', onPlay);
    v.addEventListener('volumechange', sync);
    const offAir = watchAirPlay(v, setAirplay);
    const offAirOn = watchAirPlayActive(v, setAirplayOn);
    const offRemote = watchRemotePlayback(v, setRemoteOk);
    return () => {
      v.removeEventListener('pause', onPause);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('volumechange', sync);
      offAir();
      offAirOn();
      offRemote();
    };
  }, []);

  // ---------- Chromecast ----------
  useEffect(() => {
    let off = () => {};
    let alive = true;
    loadCast().then((ok) => {
      if (ok && alive) off = watchCastState(setCastState);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (castingTo && castState !== 'connected' && castState !== 'connecting') setCastingTo(null);
  }, [castState, castingTo]);

  const castUrl = (s: PlayableStream | undefined) => {
    if (!s) return null;
    if ((s.x === 1 || !catalog?.checked) && s.h === 1) return s.u;
    if (settings.proxyUrl) return proxied(s.u, settings.proxyUrl, settings.proxyToken);
    return null;
  };

  const startCast = async () => {
    if (!ch) return;
    const url = castUrl(current) ?? castUrl(order.find((s) => castUrl(s)));
    if (!url) {
      toast('Ce serveur refuse les lecteurs externes : impossible de l’envoyer sur Chromecast. Active le proxy dans les réglages ou essaie une autre source.');
      return;
    }
    try {
      const name = await castMedia({ url, title: ch.n, subtitle: 'En direct sur Zapette', image: ch.l });
      setCastingTo(name);
      toast(`${ch.n} est diffusée sur ${name}.`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (!/cancel/i.test(msg)) toast('La diffusion n’a pas démarré. Vérifie que la télé est allumée et sur le même Wi-Fi.');
    }
  };

  // Quand on zappe pendant une diffusion, la télé suit.
  useEffect(() => {
    if (!castingTo || !ch) return;
    const url = castUrl(order[0]);
    if (url) castMedia({ url, title: ch.n, subtitle: 'En direct sur Zapette', image: ch.l }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch?.id]);

  // ---------- Media Session (écran verrouillé, boutons du casque) ----------
  useEffect(() => {
    if (!ch || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ch.n,
        artist: 'En direct sur Zapette',
        artwork: ch.l ? [{ src: ch.l, sizes: '512x512' }] : [],
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => zap(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => zap(-1));
    } catch {
      /* non supporté */
    }
  }, [ch, zap]);

  // ---------- Masquage automatique des contrôles ----------
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const poke = useCallback(() => {
    setUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setUi(false), 3500);
  }, []);
  useEffect(() => {
    poke();
    return () => clearTimeout(hideTimer.current);
  }, [poke, id]);
  const showUi = ui || panel !== null || state !== 'playing' || paused;

  // ---------- Plein écran ----------
  useEffect(() => {
    const on = () => {
      const d = document as FsDoc;
      setFullscreen(Boolean(document.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, []);
  const toggleFullscreen = useCallback(async () => {
    const d = document as FsDoc;
    const el = root.current as FsEl | null;
    const v = videoRef.current as IOSVideo | null;
    if (document.fullscreenElement || d.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
      return;
    }
    if (el?.requestFullscreen) {
      await el.requestFullscreen().catch(() => {});
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (isMobile) o?.lock?.('landscape').catch(() => {});
    } else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else v?.webkitEnterFullscreen?.(); // iPhone
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);

  const togglePip = async () => {
    const v = videoRef.current as IOSVideo | null;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
      else v.webkitSetPresentationMode?.('picture-in-picture');
    } catch {
      toast('Image dans l’image indisponible pour ce flux.');
    }
  };

  // ---------- Clavier ----------
  const typedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
      poke();
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setTyped((t) => {
          const next = (t + e.key).slice(-4);
          clearTimeout(typedTimer.current);
          typedTimer.current = setTimeout(() => {
            setTyped('');
            goToNumber(Number(next));
          }, 1300);
          return next;
        });
        return;
      }
      switch (e.key) {
        case ' ':
        case 'k':
          if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'm':
          toggleMute();
          break;
        case 'ArrowUp':
        case 'PageUp':
        case 'ChannelUp':
          e.preventDefault();
          zap(1);
          break;
        case 'ArrowDown':
        case 'PageDown':
        case 'ChannelDown':
          e.preventDefault();
          zap(-1);
          break;
        case 'l':
          setPanel((p) => (p === 'list' ? null : 'list'));
          break;
        case 'i':
          setPanel((p) => (p === 'info' ? null : 'info'));
          break;
        case 'Escape':
          if (panel) setPanel(null);
          else if (!document.fullscreenElement) goBack('/');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poke, togglePlay, toggleFullscreen, toggleMute, zap, goToNumber, panel]);

  // ---------- Gestes : glisser vers le haut / le bas pour zapper ----------
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dy) > 70 && Math.abs(dx) < 50 && Date.now() - start.t < 600) {
      zap(dy < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (ui) setUi(false);
      else poke();
    }
  };

  // ---------- Rendu ----------
  if (status === 'loading') {
    return (
      <div className="player">
        <div className="player-center">
          <span className="spinner" aria-hidden="true" />
          <p>Chargement des chaînes…</p>
        </div>
      </div>
    );
  }
  if (!ch) {
    return (
      <div className="player">
        <div className="player-card">
          <h2>Chaîne introuvable</h2>
          <p>Elle a peut-être été retirée de la liste. Les chaînes changent quand leurs liens disparaissent.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
            Retour à l’accueil
          </button>
        </div>
      </div>
    );
  }

  const fav = favs.includes(ch.id);
  const retry = () => {
    setFailed(new Set());
    setSrcIndex(0);
    setOrder(ch.play.filter((s) => s.mode !== 'external'));
    setAttempt((a) => a + 1);
    setState('loading');
  };
  const chooseSource = (i: number) => {
    setSrcIndex(i);
    setAttempt((a) => a + 1);
    setState('loading');
  };
  const vlcStream = current ?? externals[0] ?? ch.play[0];

  return (
    <div
      className={`player${showUi ? ' ui-on' : ''}`}
      ref={root}
      onMouseMove={fine ? poke : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        x-webkit-airplay="allow"
        onClick={fine ? togglePlay : undefined}
        onDoubleClick={fine ? toggleFullscreen : undefined}
        aria-label={`Vidéo : ${ch.n}`}
      />

      {state === 'loading' && !castingTo && (
        <div className="player-center" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>
            Connexion à {ch.n}
            {srcIndex > 0 ? ` : source ${srcIndex + 1} sur ${order.length}` : '…'}
          </p>
        </div>
      )}
      {state === 'playing' && waiting && !castingTo && (
        <div className="player-center subtle" aria-hidden="true">
          <span className="spinner" />
        </div>
      )}

      {state === 'error' && (
        <div className="player-card" role="alert">
          <h2>{navigator.onLine === false ? 'Pas de connexion internet' : `${ch.n} ne répond pas en ce moment`}</h2>
          <p>
            {navigator.onLine === false
              ? 'Reconnecte-toi puis réessaie.'
              : `${order.length > 1 ? `Ses ${order.length} sources ont été essayées.` : 'Sa source a été essayée.'} La chaîne est masquée de tes listes pendant 6 heures, le temps qu’elle revienne.`}
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => zap(1)}>
              Chaîne suivante
            </button>
            <button type="button" className="btn btn-ghost" onClick={retry}>
              <Icon name="refresh" size={18} /> Réessayer
            </button>
            {vlcStream && (
              <button type="button" className="btn btn-ghost" onClick={() => openInVlc(ch, vlcStream)}>
                <Icon name="external" size={18} /> Essayer dans VLC
              </button>
            )}
          </div>
        </div>
      )}

      {state === 'external' && (
        <div className="player-card" role="alert">
          <h2>Lecture dans le navigateur impossible</h2>
          <p>Le serveur de {ch.n} n’autorise pas la lecture depuis un site web sur cet appareil. L’app VLC (gratuite) la lit sans problème.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => openInVlc(ch, externals[0])}>
              <Icon name="external" size={18} /> Ouvrir dans VLC
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => zap(1)}>
              Chaîne suivante
            </button>
          </div>
          <p className="muted small">Astuce : le proxy facultatif (Réglages) rend ces chaînes lisibles directement dans Zapette.</p>
        </div>
      )}

      {castingTo && (
        <div className="player-card cast-card">
          <Icon name="cast" size={32} />
          <h2>Diffusé sur {castingTo}</h2>
          <p>Zappe ici, la télé suit.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              stopCasting();
              setCastingTo(null);
            }}
          >
            Arrêter la diffusion
          </button>
        </div>
      )}
      {airplayOn && (
        <div className="airplay-badge">
          <Icon name="airplay" size={18} /> Sur AirPlay
        </div>
      )}

      {soundBlocked && state === 'playing' && (
        <button
          type="button"
          className="btn btn-primary sound-btn"
          onClick={() => {
            const v = videoRef.current;
            if (v) v.muted = false;
            setSoundBlocked(false);
          }}
        >
          <Icon name="volume" size={20} /> Activer le son
        </button>
      )}

      <div className={`osd${osdShow || typed ? ' show' : ''}`} aria-hidden="true">
        <span className="osd-num">{typed ? `${typed}_` : ch.num}</span>
        {!typed && <span className="osd-name">{ch.n}</span>}
      </div>

      <div className="p-top">
        <button type="button" className="icon-btn" onClick={() => goBack('/')} aria-label="Retour">
          <Icon name="back" size={26} />
        </button>
        <div className="p-title">
          <span className="p-logo">
            <ChannelLogo ch={ch} />
          </span>
          <span>
            <strong>{ch.n}</strong>
            <small>
              <span className="live-dot" aria-hidden="true" /> En direct
              {current?.q ? ` en ${qualityLabel(current.q) || current.q}` : ''}
            </small>
          </span>
        </div>
        <div className="p-actions">
          <button type="button" className="icon-btn" onClick={() => toggleFavorite(ch.id)} aria-pressed={fav} aria-label={fav ? 'Retirer de ma liste' : 'Ajouter à ma liste'}>
            <Icon name="star" filled={fav} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setPanel('share')} aria-label="Partager">
            <Icon name="share" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setPanel(panel === 'info' ? null : 'info')} aria-label="Infos sur la chaîne">
            <Icon name="info" />
          </button>
        </div>
      </div>

      <div className="p-bottom">
        <div className="p-group">
          {state === 'playing' && !castingTo && (
            <button type="button" className="icon-btn big" onClick={togglePlay} aria-label={paused ? 'Lecture' : 'Pause'}>
              <Icon name={paused ? 'play' : 'pause'} size={28} />
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => zap(-1)} aria-label="Chaîne précédente">
            <Icon name="down" />
          </button>
          <button type="button" className="icon-btn" onClick={() => zap(1)} aria-label="Chaîne suivante">
            <Icon name="up" />
          </button>
          {fine && (
            <span className="volume">
              <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Activer le son' : 'Couper le son'}>
                <Icon name={muted || volume === 0 ? 'mute' : 'volume'} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = Number(e.target.value);
                  v.muted = v.volume === 0;
                }}
              />
            </span>
          )}
        </div>
        <div className="p-group">
          <button type="button" className="icon-btn" onClick={() => setPanel(panel === 'sources' ? null : 'sources')} aria-label="Sources et qualité">
            <Icon name="layers" />
            {order.length > 1 && <span className="badge">{order.length}</span>}
          </button>
          <button type="button" className="icon-btn" onClick={() => setPanel(panel === 'list' ? null : 'list')} aria-label="Liste des chaînes">
            <Icon name="list" />
          </button>
          {pipSupported && !isIOS && (
            <button type="button" className="icon-btn" onClick={togglePip} aria-label="Image dans l’image">
              <Icon name="pip" />
            </button>
          )}
          {airplay && (
            <button type="button" className="icon-btn" onClick={() => videoRef.current && showAirPlayPicker(videoRef.current)} aria-label="AirPlay">
              <Icon name="airplay" />
            </button>
          )}
          {castState !== 'unavailable' ? (
            <button type="button" className={`icon-btn${castingTo ? ' on' : ''}`} onClick={startCast} aria-label="Caster sur la télé">
              <Icon name="cast" />
            </button>
          ) : (
            remoteOk &&
            current?.mode === 'native' && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => videoRef.current && promptRemotePlayback(videoRef.current).catch(() => {})}
                aria-label="Caster sur la télé"
              >
                <Icon name="cast" />
              </button>
            )
          )}
          <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}>
            <Icon name={fullscreen ? 'fullscreen-exit' : 'fullscreen'} />
          </button>
        </div>
      </div>

      {panel === 'sources' && (
        <aside className="p-panel" aria-label="Sources et qualité">
          <header>
            <h2>Sources</h2>
            <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Fermer">
              <Icon name="close" />
            </button>
          </header>
          <ul className="src-list">
            {order.map((s, i) => {
              const l = streamLabel(s, i);
              return (
                <li key={s.u}>
                  <button type="button" aria-current={i === srcIndex} onClick={() => chooseSource(i)} disabled={i === srcIndex && state === 'playing'}>
                    <span className="src-title">
                      {l.title}
                      {i === srcIndex && state === 'playing' && <em>en cours</em>}
                      {failed.has(s.u) && <em className="bad">en échec</em>}
                    </span>
                    <span className="src-bits">
                      {l.bits.map((b) => (
                        <span key={b}>{b}</span>
                      ))}
                      {s.r && <span>bloquée hors de France ?</span>}
                      {s.n && <span>pas 24 h/24</span>}
                      {s.mode === 'proxy' && <span>via proxy</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {levels.length > 1 && (
            <>
              <h3>Qualité</h3>
              <div className="chips">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={level === -1}
                  onClick={() => {
                    engineRef.current?.setLevel(-1);
                    setLevelState(-1);
                  }}
                >
                  Auto
                </button>
                {[...levels]
                  .sort((a, b) => b.height - a.height)
                  .map((l) => (
                    <button
                      type="button"
                      key={l.index}
                      className="chip"
                      aria-pressed={level === l.index}
                      onClick={() => {
                        engineRef.current?.setLevel(l.index);
                        setLevelState(l.index);
                      }}
                    >
                      {l.height}p
                    </button>
                  ))}
              </div>
            </>
          )}
          {vlcStream && (
            <button type="button" className="btn btn-ghost" onClick={() => openInVlc(ch, vlcStream)}>
              <Icon name="external" size={18} /> Ouvrir dans VLC
            </button>
          )}
        </aside>
      )}

      {panel === 'list' && <ZapPanel list={zapList} currentId={ch.id} onClose={() => setPanel(null)} />}

      {panel === 'info' && (
        <aside className="p-panel" aria-label="Infos">
          <header>
            <h2>{ch.n}</h2>
            <button type="button" className="icon-btn" onClick={() => setPanel(null)} aria-label="Fermer">
              <Icon name="close" />
            </button>
          </header>
          <dl className="info-list">
            <dt>Numéro</dt>
            <dd>{ch.num}</dd>
            {ch.c && (
              <>
                <dt>Pays</dt>
                <dd>
                  {countryFlag(ch.c)} {countryName(ch.c)}
                </dd>
              </>
            )}
            {ch.g.length > 0 && (
              <>
                <dt>Catégories</dt>
                <dd>{ch.g.map(categoryLabel).join(', ')}</dd>
              </>
            )}
            {ch.lg?.length ? (
              <>
                <dt>Langues</dt>
                <dd>{ch.lg.map(languageName).join(', ')}</dd>
              </>
            ) : null}
            <dt>Sources</dt>
            <dd>
              {order.length} lisible{order.length > 1 ? 's' : ''} ici
              {externals.length ? `, ${externals.length} dans VLC` : ''}
            </dd>
            {catalog?.checked && (
              <>
                <dt>Vérifiée</dt>
                <dd>{timeAgo(catalog.generatedAt)}</dd>
              </>
            )}
          </dl>
          {ch.w && (
            <a className="btn btn-ghost" href={ch.w} target="_blank" rel="noreferrer">
              <Icon name="external" size={18} /> Site officiel
            </a>
          )}
          <p className="muted small">Raccourcis : ↑ ↓ zapper, chiffres pour taper un numéro, F plein écran, M son, L liste.</p>
        </aside>
      )}

      {panel === 'share' && <ShareSheet ch={ch} stream={current ?? ch.play[0]} onClose={() => setPanel(null)} />}
    </div>
  );
}

function ZapPanel({ list, currentId, onClose }: { list: LiveChannel[]; currentId: string; onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const [limit, setLimit] = useState(200);
  const idx = list.findIndex((c) => c.id === currentId);
  const start = Math.max(0, Math.min(idx - 20, list.length - limit));
  const shown = list.slice(start, start + limit);
  useEffect(() => {
    ref.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [currentId]);
  return (
    <aside className="p-panel p-panel-list" aria-label="Chaînes">
      <header>
        <h2>Chaînes</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
          <Icon name="close" />
        </button>
      </header>
      <ul className="zap-list" ref={ref}>
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" aria-current={c.id === currentId} onClick={() => navigate(watchPath(c.id), { replace: true })}>
              <span className="zap-num">{c.num}</span>
              <span className="zap-logo">
                <ChannelLogo ch={c} />
              </span>
              <span className="zap-name">{c.n}</span>
            </button>
          </li>
        ))}
      </ul>
      {start + limit < list.length && (
        <button type="button" className="btn btn-text" onClick={() => setLimit((l) => l + 200)}>
          Afficher plus
        </button>
      )}
    </aside>
  );
}

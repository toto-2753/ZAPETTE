import { useEffect, useRef, useState } from 'react';
import type { LiveChannel } from '../data/types';
import { categoryLabel, categoryTint, countryFlag, countryName, qualityLabel } from '../data/labels';
import { favoritesStore, settingsStore, toggleFavorite } from '../lib/stores';
import { saveData } from '../lib/platform';
import { ChannelLogo, playChannel } from './Channel';
import { Icon } from './Icon';
import { useMediaQuery } from './ui';

/** Choisit la chaîne du bandeau : bien notée, lisible ici, avec logo ; stable pendant la visite. */
export function pickHero(list: LiveChannel[], pool: (c: LiveChannel) => boolean = () => true) {
  const candidates = list
    .filter((c) => c.l && pool(c) && (c.play[0]?.mode === 'hls' || c.play[0]?.mode === 'native') && !c.play[0]?.r)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  if (!candidates.length) return list[0];
  let seed = 0;
  try {
    seed = Number(sessionStorage.getItem('zp.heroSeed') ?? NaN);
    if (Number.isNaN(seed)) {
      seed = Math.floor(Math.random() * 1000);
      sessionStorage.setItem('zp.heroSeed', String(seed));
    }
  } catch {
    seed = 0;
  }
  return candidates[seed % candidates.length];
}

export function Hero({ ch, list, kicker = 'En direct' }: { ch: LiveChannel; list: LiveChannel[]; kicker?: string }) {
  const favs = favoritesStore.use();
  const { heroPreview } = settingsStore.use();
  const fav = favs.includes(ch.id);
  const big = useMediaQuery('(min-width: 900px) and (pointer: fine)');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const q = qualityLabel(ch.play[0]?.q);

  // Aperçu muet sur grand écran : la chaîne joue « dans la télé » du bandeau.
  useEffect(() => {
    setLive(false);
    const best = ch.play.find((p) => p.mode === 'hls');
    if (!big || !heroPreview || saveData || !best || !videoRef.current) return;
    let engine: { destroy: () => void } | null = null;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { Engine } = await import('../player/engine');
      if (cancelled || !videoRef.current) return;
      const e = new Engine(videoRef.current, { onPlaying: () => setLive(true), onFatal: () => setLive(false) });
      e.load(best.u, best.mode, { muted: true, capLevel: true, startTimeoutMs: 12_000 });
      engine = e;
    }, 1200);
    const onHide = () => {
      if (document.hidden) engine?.destroy();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      engine?.destroy();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [ch, big, heroPreview]);

  return (
    <section className="hero" data-tint={categoryTint(ch.g)}>
      <div className="hero-copy">
        <p className="hero-kicker">
          <span className="live-dot" aria-hidden="true" />
          {kicker}
        </p>
        <h1 className="hero-title">{ch.n}</h1>
        <p className="hero-meta">
          {ch.c && (
            <span>
              {countryFlag(ch.c)} {countryName(ch.c)}
            </span>
          )}
          {ch.g.slice(0, 2).map((g) => (
            <span key={g}>{categoryLabel(g)}</span>
          ))}
          {q && <span className="q">{q}</span>}
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => playChannel(ch, list)}>
            <Icon name="play" size={20} /> Regarder
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => toggleFavorite(ch.id)} aria-pressed={fav}>
            <Icon name={fav ? 'check' : 'plus'} size={20} /> {fav ? 'Dans ma liste' : 'Ma liste'}
          </button>
        </div>
      </div>
      <button type="button" className={`hero-screen${live ? ' is-live' : ''}`} onClick={() => playChannel(ch, list)} aria-label={`Regarder ${ch.n}`}>
        <span className="hero-plate">
          <ChannelLogo ch={ch} />
        </span>
        <video ref={videoRef} muted playsInline aria-hidden="true" tabIndex={-1} />
        <span className="hero-osd" aria-hidden="true">
          {String(ch.num).padStart(2, '0')}
        </span>
      </button>
    </section>
  );
}

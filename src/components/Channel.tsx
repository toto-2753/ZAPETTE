import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LiveChannel } from '../data/types';
import { categoryLabel, categoryTint, countryFlag, qualityLabel } from '../data/labels';
import { setZapList } from '../data/catalog';
import { favoritesStore } from '../lib/stores';
import { probeChannels } from '../lib/probe';
import { navigate, watchPath } from '../router';
import { Icon } from './Icon';
import { useOnceVisible } from './ui';

const hue = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};
const initials = (n: string) =>
  n
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export function ChannelLogo({ ch, className = '' }: { ch: LiveChannel; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!ch.l || failed) {
    return (
      <span className={`logo-fallback ${className}`} style={{ ['--h' as string]: hue(ch.id) }} aria-hidden="true">
        {initials(ch.n) || '?'}
      </span>
    );
  }
  return (
    <img
      className={`logo ${className}`}
      src={ch.l}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function playChannel(ch: LiveChannel, list?: LiveChannel[]) {
  if (list) setZapList(list.map((c) => c.id));
  navigate(watchPath(ch.id));
}

export function ChannelTile({ ch, list }: { ch: LiveChannel; list: LiveChannel[] }) {
  const favs = favoritesStore.use();
  const fav = favs.includes(ch.id);
  const q = qualityLabel(ch.play[0]?.q);
  const cat = categoryLabel(ch.g[0] ?? '');
  return (
    <a
      className="tile"
      href={'#' + watchPath(ch.id)}
      data-tint={categoryTint(ch.g)}
      onClick={(e) => {
        e.preventDefault();
        playChannel(ch, list);
      }}
      aria-label={`${ch.n}, chaîne ${ch.num}`}
    >
      <span className="plate">
        <ChannelLogo ch={ch} />
        <span className="osd-num" aria-hidden="true">
          {ch.num}
        </span>
        {fav && (
          <span className="tile-fav" aria-hidden="true">
            <Icon name="star" size={13} filled />
          </span>
        )}
      </span>
      <span className="tile-name">{ch.n}</span>
      <span className="tile-meta">
        {ch.c && <span aria-hidden="true">{countryFlag(ch.c)}</span>}
        {cat && <span className="cat">{cat}</span>}
        {q && <span className="q">{q}</span>}
      </span>
    </a>
  );
}

/** Déplacement au clavier (flèches) entre les tuiles d'une rangée ou d'une grille. */
function arrowNav(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tiles = [...e.currentTarget.querySelectorAll<HTMLElement>('.tile')];
  const i = tiles.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  const next = tiles[i + (e.key === 'ArrowRight' ? 1 : -1)];
  if (next) {
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

export function Row({ title, items, more, children }: { title: string; items: LiveChannel[]; more?: string; children?: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const ref = useOnceVisible<HTMLElement>(() => probeChannels(items.slice(0, 14)), [items]);
  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  return (
    <section className="row" ref={ref}>
      <header className="row-head">
        <h2>{title}</h2>
        {more && (
          <a className="row-more" href={'#' + more}>
            Tout voir
          </a>
        )}
      </header>
      <div className="row-body">
        <button type="button" className="row-nav prev" onClick={() => scroll(-1)} aria-label={`Défiler ${title} vers la gauche`} tabIndex={-1}>
          <Icon name="left" />
        </button>
        <div className="row-track" ref={track} onKeyDown={arrowNav}>
          {children}
          {items.map((ch) => (
            <ChannelTile key={ch.id} ch={ch} list={items} />
          ))}
        </div>
        <button type="button" className="row-nav next" onClick={() => scroll(1)} aria-label={`Défiler ${title} vers la droite`} tabIndex={-1}>
          <Icon name="right" />
        </button>
      </div>
    </section>
  );
}

const PAGE = 60;

/** Grille à défilement infini (60 chaînes de plus à chaque fois qu'on approche du bas). */
export function Grid({ items }: { items: LiveChannel[] }) {
  const [count, setCount] = useState(PAGE);
  const [lastItems, setLastItems] = useState(items);
  if (lastItems !== items) {
    setLastItems(items);
    setCount(PAGE);
  }
  const shown = items.slice(0, count);
  const sentinel = useOnceVisible<HTMLDivElement>(() => setCount((c) => c + PAGE), [count, items]);
  const probeRef = useOnceVisible<HTMLDivElement>(() => probeChannels(shown.slice(-PAGE)), [count, items]);
  return (
    <>
      <div className="grid" onKeyDown={arrowNav} ref={probeRef}>
        {shown.map((ch) => (
          <ChannelTile key={ch.id} ch={ch} list={items} />
        ))}
      </div>
      {count < items.length && <div className="grid-sentinel" ref={sentinel} aria-hidden="true" />}
    </>
  );
}

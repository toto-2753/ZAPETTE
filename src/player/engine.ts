import Hls from 'hls.js';
import type { PlayMode } from '../data/types';
import { proxied } from '../lib/proxy';

export interface LevelInfo {
  index: number;
  height: number;
  bitrate: number;
}

export interface EngineCallbacks {
  onPlaying?: () => void;
  onFatal?: (reason: string) => void;
  onLevels?: (levels: LevelInfo[]) => void;
  onWaiting?: (waiting: boolean) => void;
  onAutoplayBlocked?: () => void;
}

export interface LoadOptions {
  proxyUrl?: string;
  proxyToken?: string;
  muted?: boolean;
  /** délai max pour que l'image démarre avant de passer à la source suivante */
  startTimeoutMs?: number;
  /** limiter la qualité à la taille du lecteur (aperçus) */
  capLevel?: boolean;
}


export const hlsJsSupported = () => Hls.isSupported();

/**
 * Pilote un <video> : hls.js quand le serveur autorise CORS, sinon lecteur HLS natif.
 * Signale `onFatal` si l'image ne démarre pas à temps ou si le flux tombe — l'appelant passe alors
 * à la source suivante.
 */
export class Engine {
  private hls: Hls | null = null;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private recoveredMedia = false;
  private recoveredNetwork = false;
  private off: (() => void)[] = [];
  private failed = false;

  constructor(
    private video: HTMLVideoElement,
    private cb: EngineCallbacks,
  ) {}

  load(url: string, mode: PlayMode, opts: LoadOptions = {}) {
    this.reset();
    const v = this.video;
    const src = mode === 'proxy' && opts.proxyUrl ? proxied(url, opts.proxyUrl, opts.proxyToken) : url;
    const useHlsJs = (mode === 'hls' || mode === 'proxy') && Hls.isSupported();
    v.muted = Boolean(opts.muted);

    this.listen('playing', () => {
      this.started = true;
      clearTimeout(this.startTimer);
      clearTimeout(this.stallTimer);
      this.cb.onWaiting?.(false);
      this.cb.onPlaying?.();
    });
    this.listen('waiting', () => {
      this.cb.onWaiting?.(true);
      if (this.started) {
        clearTimeout(this.stallTimer);
        this.stallTimer = setTimeout(() => this.fail('bloqué en chargement'), 25_000);
      }
    });
    this.listen('error', () => {
      if (!useHlsJs) this.fail(`erreur média ${v.error?.code ?? ''}`.trim());
    });
    this.startTimer = setTimeout(() => this.fail('ne démarre pas'), opts.startTimeoutMs ?? 15_000);

    if (useHlsJs) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 24,
        liveSyncDurationCount: 3,
        manifestLoadingTimeOut: 10_000,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 10_000,
        levelLoadingMaxRetry: 2,
        fragLoadingTimeOut: 20_000,
        fragLoadingMaxRetry: 3,
        capLevelToPlayerSize: Boolean(opts.capLevel),
        startLevel: -1,
      });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.cb.onLevels?.(
          hls.levels.map((l, index) => ({ index, height: l.height || 0, bitrate: l.bitrate || 0 })).filter((l) => l.height > 0),
        );
        void this.tryPlay();
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recoveredMedia) {
          this.recoveredMedia = true;
          hls.recoverMediaError();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && this.started && !this.recoveredNetwork) {
          this.recoveredNetwork = true;
          hls.startLoad();
          return;
        }
        this.fail(String(data.details || data.type));
      });
      hls.loadSource(src);
      hls.attachMedia(v);
    } else {
      v.src = src;
      v.load();
      void this.tryPlay();
    }
  }

  private async tryPlay() {
    const v = this.video;
    try {
      await v.play();
    } catch (e) {
      const err = e as DOMException;
      if (err?.name === 'NotAllowedError' && !v.muted) {
        // Lecture auto avec le son refusée : on lance en muet et on propose d'activer le son.
        v.muted = true;
        this.cb.onAutoplayBlocked?.();
        try {
          await v.play();
        } catch {
          /* l'utilisateur appuiera sur lecture */
        }
      }
    }
  }

  private listen(type: string, fn: () => void) {
    this.video.addEventListener(type, fn);
    this.off.push(() => this.video.removeEventListener(type, fn));
  }

  private fail(reason: string) {
    if (this.failed) return;
    this.failed = true;
    clearTimeout(this.startTimer);
    clearTimeout(this.stallTimer);
    this.cb.onFatal?.(reason);
  }

  get levels(): LevelInfo[] {
    return this.hls?.levels.map((l, index) => ({ index, height: l.height || 0, bitrate: l.bitrate || 0 })) ?? [];
  }

  get autoLevel() {
    return this.hls ? this.hls.autoLevelEnabled : true;
  }

  get currentLevel() {
    return this.hls ? this.hls.currentLevel : -1;
  }

  /** -1 = automatique */
  setLevel(index: number) {
    if (this.hls) this.hls.currentLevel = index;
  }

  get usesHlsJs() {
    return this.hls !== null;
  }

  /** Revient au direct après une pause. */
  goLive() {
    const v = this.video;
    const sync = this.hls?.liveSyncPosition;
    if (sync && Number.isFinite(sync)) {
      v.currentTime = sync;
      return;
    }
    if (v.seekable.length) {
      const end = v.seekable.end(v.seekable.length - 1);
      if (Number.isFinite(end) && end - v.currentTime > 8) v.currentTime = end - 2;
    }
  }

  private reset() {
    clearTimeout(this.startTimer);
    clearTimeout(this.stallTimer);
    this.off.forEach((f) => f());
    this.off = [];
    this.hls?.destroy();
    this.hls = null;
    this.started = false;
    this.failed = false;
    this.recoveredMedia = false;
    this.recoveredNetwork = false;
    const v = this.video;
    if (v.getAttribute('src')) {
      v.removeAttribute('src');
      try {
        v.load();
      } catch {
        /* rien */
      }
    }
  }

  destroy() {
    this.reset();
    this.failed = true;
  }
}

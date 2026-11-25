// Ce que l'appareil sait faire : HLS natif, Media Source (hls.js), AirPlay, Chromecast, partage…

const nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined;
const ua = nav?.userAgent ?? '';

export const isIOS = /iP(hone|ad|od)/.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1);
export const isAndroid = /Android/i.test(ua);
export const isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(ua);
export const isChromium = !isIOS && /Chrome|Chromium|Edg\//.test(ua) && !/OPR|SamsungBrowser/.test(ua);
export const isMobile = isIOS || isAndroid || /Mobi/i.test(ua);
export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean })?.standalone === true);

function probeVideo(type: string) {
  if (typeof document === 'undefined') return '';
  try {
    return document.createElement('video').canPlayType(type);
  } catch {
    return '';
  }
}

/** Le navigateur lit le HLS lui-même (Safari, Chrome Android…) : pas besoin de CORS. */
export const nativeHls = !!probeVideo('application/vnd.apple.mpegurl');

/** Media Source disponible : hls.js peut jouer le flux (si le serveur autorise CORS). */
export const mseSupported = (() => {
  if (typeof window === 'undefined') return false;
  type MSCtor = { isTypeSupported?: (t: string) => boolean } | undefined;
  const w = window as unknown as { MediaSource?: MSCtor; ManagedMediaSource?: MSCtor; WebKitMediaSource?: MSCtor };
  const MS = w.MediaSource || w.ManagedMediaSource || w.WebKitMediaSource;
  try {
    return !!MS && typeof MS.isTypeSupported === 'function' && MS.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
  } catch {
    return false;
  }
})();

/** Sur Safari / iOS on préfère le lecteur natif (AirPlay, batterie, plein écran). */
export const preferNative = nativeHls && (isSafari || isIOS);

/** Page servie en http (réseau local) : les flux http y sont lisibles. */
export const pageIsHttp = typeof location !== 'undefined' && location.protocol === 'http:';

export const canShare = typeof nav?.share === 'function';
export const saveData = Boolean((nav as Navigator & { connection?: { saveData?: boolean } })?.connection?.saveData);

export const pipSupported =
  typeof document !== 'undefined' &&
  ((document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true ||
    (typeof HTMLVideoElement !== 'undefined' && 'webkitSupportsPresentationMode' in HTMLVideoElement.prototype));

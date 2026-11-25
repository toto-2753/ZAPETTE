// AirPlay (Safari sur iPhone, iPad et Mac) et Remote Playback (Chrome Android en lecture native).

type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
  remote?: {
    watchAvailability: (cb: (available: boolean) => void) => Promise<number>;
    cancelWatchAvailability: (id?: number) => Promise<void>;
    prompt: () => Promise<void>;
    state: string;
  };
};

export const airPlaySupported = () => typeof window !== 'undefined' && 'WebKitPlaybackTargetAvailabilityEvent' in window;

export function watchAirPlay(video: HTMLVideoElement, cb: (available: boolean) => void): () => void {
  if (!airPlaySupported()) return () => {};
  const handler = (e: Event) => cb((e as Event & { availability?: string }).availability === 'available');
  video.addEventListener('webkitplaybacktargetavailabilitychanged', handler);
  return () => video.removeEventListener('webkitplaybacktargetavailabilitychanged', handler);
}

export function watchAirPlayActive(video: HTMLVideoElement, cb: (active: boolean) => void): () => void {
  const v = video as AirPlayVideo;
  const handler = () => cb(Boolean(v.webkitCurrentPlaybackTargetIsWireless));
  video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', handler);
  return () => video.removeEventListener('webkitcurrentplaybacktargetiswirelesschanged', handler);
}

export function showAirPlayPicker(video: HTMLVideoElement) {
  (video as AirPlayVideo).webkitShowPlaybackTargetPicker?.();
}

/** API standard de lecture à distance (Chrome Android quand la vidéo est lue nativement). */
export function watchRemotePlayback(video: HTMLVideoElement, cb: (available: boolean) => void): () => void {
  const remote = (video as AirPlayVideo).remote;
  if (!remote || airPlaySupported()) return () => {};
  let id: number | undefined;
  remote
    .watchAvailability(cb)
    .then((x) => (id = x))
    .catch(() => cb(false));
  return () => {
    remote.cancelWatchAvailability(id).catch(() => {});
  };
}

export async function promptRemotePlayback(video: HTMLVideoElement) {
  await (video as AirPlayVideo).remote?.prompt();
}

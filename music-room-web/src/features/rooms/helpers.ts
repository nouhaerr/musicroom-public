import { useEffect, useMemo } from 'react';
import { ApiError, type ApiClient } from '../../api/contract';
import type { Position } from './parties';
import { songsApi } from './songs';

// Small pieces the rooms and playlists pages share: an error that goes away, the position, the sound

// Each message has its own timer; replacing or removing it cancels that timer
export function useAutoDismiss(message: string, clear: (value: string) => void) {
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => clear(''), 10_000);
    return () => clearTimeout(timeout);
  }, [message, clear]);
}

// Where this computer is, read each time it is needed. A browser gives it only to a secure page (HTTPS or localhost).
export function currentPosition(): Promise<Position> {
  if (!window.isSecureContext || !navigator.geolocation) {
    return Promise.reject(new Error('The browser gives the position only on HTTPS or localhost. Open the site that way to vote here.'));
  }
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    failure => reject(new Error(failure.code === failure.PERMISSION_DENIED
      ? 'This party only counts votes from people at its location. Allow location access to vote.'
      : 'Your position could not be read. Turn on location and try again.')),
    { timeout: 15_000 },
  ));
}

export const EXTRACT_SECONDS = 30; // how long the catalog's extracts last

// The page's player: it stops when the page closes
export function useExtractPlayer() {
  const audio = useMemo(() => new Audio(), []);
  useEffect(() => () => { audio.pause(); audio.removeAttribute('src'); }, [audio]);
  return audio;
}

// Plays the 30-second extract of a stored song from `fromSec`, with a fresh link. False when the song has none.
// `wanted` tells, once the link arrives, whether this song is still the one to play. A browser refuses sound before the
// first click on the page: that refusal comes back as an error named NotAllowedError.
export async function playExtract(audio: HTMLAudioElement, client: ApiClient, songId: string, fromSec: number, wanted: () => boolean) {
  let url: string;
  try { url = await songsApi(client).preview(songId); }
  catch (e) {
    if (e instanceof ApiError && e.status === 404) return false;
    throw e;
  }
  if (!wanted()) return true;
  audio.src = fromSec > 0 ? `${url}#t=${fromSec.toFixed(1)}` : url; // the #t= part starts the sound at that second
  await audio.play();
  return true;
}

export const blockedByBrowser = (error: unknown) => error instanceof DOMException && error.name === 'NotAllowedError';

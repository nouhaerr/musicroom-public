import { useEffect, useMemo, useRef, useState } from 'react';
import { client } from '../../api/instance';
import { live } from '../../realtime/instance';
import { useAuth } from '../auth/AuthProvider';
import { songsApi } from '../rooms/songs';
import { EXTRACT_SECONDS } from '../rooms/helpers';
import './playback-agent.css';

// Keeps a registered browser ready to receive a delegated command, even away from a playlist page.
export function PlaybackAgent() {
  const { user } = useAuth();
  const audio = useMemo(() => new Audio(), []);
  const sequence = useRef(0);
  const activePlayback = useRef<{ playlistId: string; playlistSongId: string } | null>(null);
  const [status, setStatus] = useState('');
  const [pendingUrl, setPendingUrl] = useState('');

  useEffect(() => {
    if (!user) return;
    return live.watchPlaybackCommands(command => {
      const current = ++sequence.current;
      setPendingUrl('');
      if (command.action === 'STOP') {
        const active = activePlayback.current;
        if (active) live.reportPlaybackStatus({ ...active, state: 'STOPPED', positionSeconds: Math.min(audio.currentTime || 0, EXTRACT_SECONDS), durationSeconds: EXTRACT_SECONDS });
        activePlayback.current = null;
        audio.pause(); audio.removeAttribute('src');
        setStatus('Remote playback stopped.');
        return;
      }
      if (!command.songId) return;
      const active = command.playlistSongId ? { playlistId: command.playlistId, playlistSongId: command.playlistSongId } : null;
      activePlayback.current = active;
      void songsApi(client).preview(command.songId).then(async url => {
        if (sequence.current !== current || !active) return;
        audio.src = url;
        try {
          await audio.play();
          if (sequence.current === current) {
            live.reportPlaybackStatus({ ...active, state: 'PLAYING', positionSeconds: 0, durationSeconds: EXTRACT_SECONDS });
            setStatus('Playing on this browser.');
          }
        } catch {
          if (sequence.current === current) {
            setPendingUrl(url); setStatus('A friend asked to play a track here. Enable sound to start.');
          }
        }
      }).catch(() => {
        if (sequence.current !== current || !active) return;
        activePlayback.current = null;
        live.reportPlaybackStatus({ ...active, state: 'UNAVAILABLE', positionSeconds: 0, durationSeconds: EXTRACT_SECONDS });
        setStatus('Remote playback could not load this track.');
      });
    });
  }, [audio, user?.id]);

  useEffect(() => {
    const report = () => {
      const active = activePlayback.current;
      if (!active || pendingUrl) return;
      const positionSeconds = Math.min(Math.max(audio.currentTime || 0, 0), EXTRACT_SECONDS);
      if (audio.ended || positionSeconds >= EXTRACT_SECONDS) {
        live.reportPlaybackStatus({ ...active, state: 'ENDED', positionSeconds: EXTRACT_SECONDS, durationSeconds: EXTRACT_SECONDS });
        activePlayback.current = null;
      } else {
        live.reportPlaybackStatus({ ...active, state: audio.paused ? 'PAUSED' : 'PLAYING', positionSeconds, durationSeconds: EXTRACT_SECONDS });
      }
    };
    const timer = window.setInterval(report, 1000);
    audio.addEventListener('ended', report);
    return () => { window.clearInterval(timer); audio.removeEventListener('ended', report); };
  }, [audio, pendingUrl]);

  useEffect(() => () => {
    sequence.current++;
    const active = activePlayback.current;
    if (active) live.reportPlaybackStatus({ ...active, state: 'STOPPED', positionSeconds: Math.min(audio.currentTime || 0, EXTRACT_SECONDS), durationSeconds: EXTRACT_SECONDS });
    activePlayback.current = null;
    audio.pause(); audio.removeAttribute('src');
  }, [audio]);

  if (!status) return null;
  return <div className="playback-agent" role="status" aria-live="polite">
    <span>{status}</span>
    {pendingUrl ? <button type="button" onClick={() => { audio.src = pendingUrl; void audio.play().then(() => {
      const active = activePlayback.current;
      if (active) live.reportPlaybackStatus({ ...active, state: 'PLAYING', positionSeconds: audio.currentTime || 0, durationSeconds: EXTRACT_SECONDS });
      setPendingUrl(''); setStatus('Playing on this browser.');
    }).catch(() => setStatus('Sound is still blocked by this browser.')); }}>Enable sound</button> : null}
    <button type="button" aria-label="Dismiss playback status" onClick={() => setStatus('')}>×</button>
  </div>;
}

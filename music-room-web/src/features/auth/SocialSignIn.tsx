import { useEffect, useRef, useState } from 'react';
import { prepareGoogle, receiveGoogle } from './browser-social';

export function SocialSignIn({ busy, onGoogle }: {
  busy: boolean;
  onGoogle: (token: string) => void;
}) {
  const googleHost = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ busy, onGoogle }); callbacks.current = { busy, onGoogle };
  const [googleError, setGoogleError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setGoogleError('');
    const release = receiveGoogle(token => { if (active && !callbacks.current.busy) callbacks.current.onGoogle(token); });
    void prepareGoogle(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '').then(sdk => {
      if (!active || !googleHost.current) return;
      googleHost.current.replaceChildren();
      sdk.accounts.id.renderButton(googleHost.current, { type: 'icon', theme: 'filled_black', size: 'large', shape: 'circle', locale: 'en' });
      setGoogleReady(true);
    }).catch(e => { if (active) setGoogleError(e.message); });
    return () => { active = false; release(); };
  }, [attempt]);
  return <div className="social-section">
    <div className="social-buttons">
      <div className="google-button-host" ref={googleHost} inert={busy} aria-label="Google sign-in" />
    </div>
    {!googleReady && !googleError && <p role="status" className="social-status">Loading Google…</p>}
    {googleError && <div className="social-status" role="status"><p>{googleError}</p><button type="button" className="social-retry" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Retry Google sign-in</button></div>}
  </div>;
}

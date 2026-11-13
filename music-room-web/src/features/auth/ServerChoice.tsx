import { useState, type FormEvent } from 'react';
import { normalizeBaseUrl, type ApiClient } from '../../api/client';

// The backend this browser talks to, chosen before logging in, like the mobile app's Server screen.
// The address is saved in this browser; changing it ends any session on the previous server.
export function ServerChoice({ client, disabled }: { client: ApiClient; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(client.baseUrl);
  const [current, setCurrent] = useState(client.baseUrl);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(''); setSaved(false);
    let url: string;
    try { url = normalizeBaseUrl(address); }
    catch (e) { setError(e instanceof Error ? e.message : 'Enter a valid server address.'); return; }
    setBusy(true);
    try {
      await client.changeServerAddress(url);
      setAddress(url); setCurrent(url); setSaved(true); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the server address.'); }
    finally { setBusy(false); }
  }

  return <div className="server-choice">
    <button type="button" className="server-choice-toggle" aria-expanded={open} disabled={disabled}
      onClick={() => { setOpen(value => !value); setError(''); setSaved(false); setAddress(current); }}>
      Server: <span>{current.replace(/^https?:\/\//, '')}</span>
    </button>
    {saved && <p role="status" className="auth-success">Server address saved.</p>}
    {open && <form className="server-choice-form" onSubmit={event => void save(event)}>
      <fieldset disabled={disabled || busy}>
        <label>Backend address<input type="url" required autoComplete="url" placeholder="http://localhost:3000" value={address}
          onChange={event => { setAddress(event.target.value); setError(''); }} aria-invalid={!!error} /></label>
        {error && <span className="field-error">{error}</span>}
        <p className="server-choice-hint">Use HTTPS for a server reachable over the internet. Saved in this browser.</p>
        <button className="button secondary" type="submit" disabled={address.trim() === current}>{busy ? 'Saving…' : 'Save server'}</button>
      </fieldset>
    </form>}
  </div>;
}

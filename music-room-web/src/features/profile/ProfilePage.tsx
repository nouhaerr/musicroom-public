import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { PhotoMenu } from './PhotoMenu';
import { avatarFromFile } from './avatar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { SocialSignIn } from '../auth/SocialSignIn';
import { editableInfo, type OwnProfile } from '../../api/profiles';
import { normalizeBaseUrl } from '../../api/client';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import './profile.css';

const text = (info: Record<string, unknown> | null | undefined, key: string) => typeof info?.[key] === 'string' ? info[key] as string : '';
export function ProfilePage() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [editing, setEditing] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState({ area: '', message: '', error: false });
  const [linking, setLinking] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [serverAddress, setServerAddress] = useState(client.baseUrl);
  useEffect(() => { let active = true; if (user) void client.getMyProfile().then(p => { if (active) setProfile(p); }).catch(e => { if (active) setFeedback({ area: 'load', message: e.message, error: true }); }); return () => { active = false; }; }, [client, user?.id]);
  useEffect(() => { if (!feedback.message) return; const timer = setTimeout(() => setFeedback({ area: '', message: '', error: false }), 10000); return () => clearTimeout(timer); }, [feedback]);
  if (!user) return <Navigate to="/auth/login" replace />;
  const message = (area: string) => feedback.area === area && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'auth-error' : 'auth-success'}>{feedback.message}</p>;
  const run = async (area: string, action: () => Promise<string>) => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setFeedback({ area: '', message: '', error: false });
    try { const result = await action(); setFeedback({ area, message: result, error: false }); }
    catch (e) { setFeedback({ area, message: e instanceof Error ? e.message : 'Please try again.', error: true }); }
    finally { flight.current = false; setBusy(false); }
  };
  if (!profile) return <section className="panel"><h1>Your corner.</h1>{feedback.error ? <>{message('load')}<button className="button" disabled={busy} onClick={() => void run('load', async () => { setProfile(await client.getMyProfile()); return ''; })}>Retry</button></> : <p role="status">Loading your profile…</p>}</section>;
  const edit = (area: string) => { setEditing(area); setFields({ name: profile.name, username: profile.username ?? '', bio: text(profile.publicInfo, 'bio'), city: text(profile.friendsOnlyInfo, 'city'), birthday: text(profile.privateInfo, 'birthday'), genres: profile.musicPreferences.join(', '), artists: text(profile.publicInfo, 'favoriteArtists') }); };
  const input = (key: string, label: string, type = 'text') => <label>{label}<input type={type} value={fields[key] ?? ''} maxLength={key === 'username' ? 30 : 500} onChange={e => setFields({ ...fields, [key]: e.target.value })} /></label>;
  const save = (area: string) => run(area, async () => {
    let changes: Record<string, unknown> = {};
    if (area === 'public') {
      const username = fields.username.trim().toLowerCase();
      if (!fields.name.trim()) throw new Error('Enter your name.');
      if (username && !/^[a-z0-9_]{3,30}$/.test(username)) throw new Error('Use 3–30 letters, numbers or underscores for your username.');
      changes = { name: fields.name.trim(), username: username || null, publicInfo: { ...editableInfo(profile.publicInfo), bio: fields.bio.trim() } };
    } else if (area === 'friends') changes = { friendsOnlyInfo: { ...editableInfo(profile.friendsOnlyInfo), city: fields.city.trim() } };
    else if (area === 'private') {
      const birthday = fields.birthday;
      if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || !Number.isFinite(Date.parse(birthday)) || new Date(birthday).toISOString().slice(0, 10) !== birthday || birthday > new Date().toISOString().slice(0, 10))) throw new Error('Enter a valid birthday in the past.');
      changes = { privateInfo: { ...editableInfo(profile.privateInfo), birthday } };
    } else {
      const genres = [...new Set(fields.genres.split(',').map(g => g.trim().toLowerCase()).filter(Boolean))];
      if (genres.length > 50 || genres.some(g => g.length > 50)) throw new Error('Choose up to 50 genres, each under 51 characters.');
      changes = { musicPreferences: genres, publicInfo: { ...editableInfo(profile.publicInfo), favoriteArtists: fields.artists.trim() } };
    }
    setProfile(await client.patchMyProfile(changes)); setEditing(''); return 'Profile updated.';
  });
  const detail = (label: string, value: string) => <div className="profile-detail"><span>{label}</span><p>{value || 'Not added yet'}</p></div>;
  const plan = profile.subscriptionPlan ?? 'FREE';
  const switchPlan = (next: OwnProfile['subscriptionPlan']) => {
    if (!next || next === plan || planBusy) return;
    setPlanBusy(true);
    void client.updateSubscription(next).then(setProfile)
      .then(() => setFeedback({ area: 'subscription', message: `Switched to ${next === 'PREMIUM' ? 'Premium' : 'Free'} plan.`, error: false }))
      .catch(e => setFeedback({ area: 'subscription', message: e instanceof Error ? e.message : 'Unable to change plan.', error: true }))
      .finally(() => setPlanBusy(false));
  };
  const card = (title: string, area: string, badge: string, content: ReactNode, form: ReactNode) => <section className="profile-card"><header><h2>{title}</h2>{editing !== area && <button disabled={busy} onClick={() => edit(area)}>Edit</button>}</header>{badge && <span className={'profile-badge ' + area}>{badge}</span>}{editing === area ? <form onSubmit={e => { e.preventDefault(); void save(area); }}><fieldset disabled={busy}>{form}<div className="profile-actions"><button className="button" type="submit">Save changes</button><button type="button" onClick={() => setEditing('')}>Cancel</button></div></fieldset></form> : content}{message(area)}</section>;
  return <div className="profile-page">{unlinkConfirm ? <ConfirmDialog title="Unlink Google?" message="Google will no longer sign in to your account. Make sure you have another sign-in method." confirmLabel="Unlink" destructive onCancel={() => setUnlinkConfirm(false)} onConfirm={() => { setUnlinkConfirm(false); void run('social', async () => { setProfile(await client.unlinkSocial('google')); return 'Google account unlinked.'; }); }} /> : null}<p className="eyebrow">PROFILE & SETTINGS</p><h1>Your corner.</h1><div className="profile-layout"><aside className="profile-identity"><div className="profile-avatar">{text(profile.publicInfo, 'avatar') ? <img src={text(profile.publicInfo, 'avatar')} alt={profile.name} /> : profile.name.slice(0, 2).toUpperCase()}</div><PhotoMenu busy={busy} hasPhoto={!!text(profile.publicInfo, 'avatar')} onChoose={() => photoInput.current?.click()} onRemove={() => void run('photo', async () => { setProfile(await client.setAvatar(null)); return 'Profile photo removed.'; })} /><input ref={photoInput} hidden aria-label="Profile photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void run('photo', async () => { setProfile(await client.setAvatar(await avatarFromFile(file))); return 'Profile photo updated.'; }); }} />{message('photo')}<h2>{profile.name}</h2><p>{profile.username ? '@' + profile.username : 'Make yourself at home.'}</p><p>{text(profile.publicInfo, 'bio')}</p><Link to="/friends">Manage friends <ArrowIcon direction="right" /></Link></aside><div className="profile-cards">
    {card('Public information', 'public', '◎ Visible to everyone', <>{detail('Display name / username', profile.name + (profile.username ? ' · @' + profile.username : ''))}{detail('Bio', text(profile.publicInfo, 'bio'))}</>, <>{input('name', 'Display name')}{input('username', 'Unique username')}{input('bio', 'Bio')}</>)}
    {card('Friends-only information', 'friends', '♧ Only your friends', detail('City', text(profile.friendsOnlyInfo, 'city')), input('city', 'City'))}
    {card('Private information', 'private', '♙ Only you', <>{detail('Email · ' + (profile.emailVerifiedAt ? 'Verified' : 'Not verified'), profile.email)}{detail('Birthday', text(profile.privateInfo, 'birthday'))}<button disabled={busy} onClick={() => void run('private', async () => { if (profile.hasPassword) await client.forgot(profile.email); else await client.requestPasswordSetup(); return 'Check your inbox for a password link. Completing it signs out your sessions.'; })}>{profile.hasPassword ? 'Change password' : 'Create password'}</button></>, input('birthday', 'Birthday', 'date'))}
    {card('Your music DNA', 'music', '', <><div className="profile-genres">{profile.musicPreferences.map(g => <span key={g}>{g}</span>)}</div>{detail('Favorite artists', text(profile.publicInfo, 'favoriteArtists'))}</>, <>{input('genres', 'Genres (comma separated)')}{input('artists', 'Favorite artists')}</>)}
    <section className="profile-card profile-wide"><header><h2>Subscription</h2><span className="profile-badge">{plan === 'PREMIUM' ? 'Premium' : 'Free'}</span></header><p>Premium removes the three-playlist limit. This demo switch is enforced by the API.</p><div className="profile-actions"><button className={plan === 'FREE' ? 'button subscription-current' : ''} disabled={planBusy || plan === 'FREE'} onClick={() => switchPlan('FREE')}>Free · 3 playlists</button><button className={plan === 'PREMIUM' ? 'button subscription-current' : ''} disabled={planBusy || plan === 'PREMIUM'} onClick={() => switchPlan('PREMIUM')}>Premium · unlimited</button></div>{message('subscription')}</section>
    <section className="profile-card profile-wide"><h2>Linked accounts</h2><div className="linked-account"><span className="provider-icon" aria-hidden="true">G</span><div><strong>Google</strong><p>{profile.googleId ? 'Connected' : 'Not connected'}</p></div>{profile.googleId ? <button disabled={busy} onClick={() => setUnlinkConfirm(true)}>Unlink</button> : <button onClick={() => setLinking(v => !v)} disabled={busy}>Link</button>}</div>{linking && <><p>Choose a Google account to link to your Sonora profile.</p><SocialSignIn busy={busy} onGoogle={token => void run('social', async () => { await client.linkGoogle(async () => token); setProfile(await client.getMyProfile()); setLinking(false); return 'Google account linked.'; })} /></>}{message('social')}</section>
    <section className="profile-card profile-wide"><h2>Connection</h2><form className="server-address-form" onSubmit={event => { event.preventDefault(); void run('server', async () => { const address = normalizeBaseUrl(serverAddress); await client.changeServerAddress(address); setServerAddress(address); navigate('/auth/login', { replace: true, state: { notice: 'Server address updated. Please log in again.' } }); return ''; }); }}><label>Backend address<input type="url" value={serverAddress} onChange={event => setServerAddress(event.target.value)} placeholder="http://localhost:3000" autoComplete="url" required /></label><button className="button" type="submit" disabled={busy || serverAddress.trim() === client.baseUrl}>Save server address</button></form><p>Changing the server signs you out of this server. The selected address is saved in this browser.</p>{message('server')}</section>
    <div className="profile-wide"><button className="button profile-logout" disabled={busy} onClick={() => void run('logout', async () => { try { await client.logout(); navigate('/auth/login', { state: { notice: 'You are logged out.' } }); } catch (e) { navigate('/auth/login', { state: { notice: e instanceof Error ? e.message : 'Logged out locally.' } }); } return ''; })}>↪ Log out</button>{message('logout')}</div>
  </div></div></div>;
}

import { ArrowIcon } from '../../components/ui/ArrowIcon';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { detachDevice, devicePage, DEVICE_PAGE_SIZE, listDelegations, listDelegatedDevices, grantControl, revokeControl, type Device, type ControlDelegation, type DelegatedDevice } from '../../api/devices';
import { socialApi } from '../../api/social';
import { live } from '../../realtime/instance';
import './devices.css';

const platformName = (platform: string) => ({ IOS: 'iOS', ANDROID: 'Android', WEB: 'Web' })[platform] ?? platform;
export function DevicesPage() {
  const { client, user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [details, setDetails] = useState<Device | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const [delegations, setDelegations] = useState<ControlDelegation[]>([]);
  const [received, setReceived] = useState<DelegatedDevice[]>([]);
  const [friends, setFriends] = useState<{ id: string; name: string; username?: string | null }[]>([]);
  const [delegationBusy, setDelegationBusy] = useState(false);
  const alive = useRef(false);
  const flight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!user) return;
    setLoading(true); setLoadError(''); setDevices([]);
    void devicePage(client, page).then(rows => {
      if (!active) return;
      if (!rows.length && page > 1) { setPage(n => n - 1); return; }
      setDevices(rows);
    }).catch(e => { if (active) setLoadError(e instanceof Error ? e.message : 'Unable to load your devices.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, user?.id, page, reload]);
  useEffect(() => {
    let active = true;
    if (!user) return;
    void Promise.all([listDelegatedDevices(client), socialApi(client).friends(1)]).then(([grants, friendRows]) => {
      if (active) { setReceived(grants); setFriends(friendRows); }
    }).catch(e => { if (active) setLoadError(e instanceof Error ? e.message : 'Unable to load shared devices.'); });
    return () => { active = false; };
  }, [client, user?.id, reload]);
  useEffect(() => live.watchControlChanges(event => {
    if (event.delegatorUserId === user?.id || event.delegateUserId === user?.id) setReload(n => n + 1);
  }), [user?.id]);
  useEffect(() => {
    let active = true;
    if (!details) { setDelegations([]); return; }
    void listDelegations(client, details.id).then(rows => { if (active) setDelegations(rows); })
      .catch(e => { if (active) setDeleteError(e instanceof Error ? e.message : 'Unable to load control access.'); });
    return () => { active = false; };
  }, [client, details?.id, reload]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 10000); return () => clearTimeout(timer); }, [notice]);
  if (!user) return <Navigate to="/auth/login" replace />;
  const close = () => { if (!flight.current) { setDetails(null); setAdding(false); setConfirming(false); setDeleteError(''); } };
  async function remove(device: Device) {
    if (flight.current) return;
    flight.current = true; setDeleting(true); setDeleteError('');
    try {
      await detachDevice(client, device.id);
      if (alive.current) { setDetails(null); setConfirming(false); setNotice('Device detached.'); setReload(n => n + 1); heading.current?.focus(); }
    } catch (e) { if (alive.current) setDeleteError(e instanceof Error ? e.message : 'Unable to detach this device. Please try again.'); }
    finally { flight.current = false; if (alive.current) setDeleting(false); }
  }
  async function changeDelegation(device: Device, friendId: string, revoke: boolean) {
    if (flight.current) return;
    flight.current = true; setDelegationBusy(true); setDeleteError('');
    try {
      if (revoke) await revokeControl(client, device.id, friendId);
      else await grantControl(client, device.id, friendId);
      if (alive.current) { setNotice(revoke ? 'Control access revoked.' : 'Control access granted.'); setReload(n => n + 1); }
    } catch (e) { if (alive.current) setDeleteError(e instanceof Error ? e.message : 'Unable to update control access.'); }
    finally { flight.current = false; if (alive.current) setDelegationBusy(false); }
  }
  return <section className="devices-page">
    <header className="devices-heading"><div><p className="eyebrow">YOUR DEVICES</p><h1 ref={heading} tabIndex={-1}>Your sound, everywhere.</h1><p>Your account. All the places you listen.</p></div><button className="device-add" title="Add a device" aria-label="Add a device" onClick={() => setAdding(true)}>＋</button></header>
    <div className="devices-overview"><section className="devices-intro"><DeviceIcon desktop /><p className="eyebrow">SONORA ON THE WEB</p><h2>Your music follows you.</h2><p>Manage the phones attached to your account from here.</p><span className="device-badge">Browser session</span><p className="device-caption">This browser is registered separately from the mobile app.</p></section><section className="devices-guide"><h2>Your account, your devices.</h2><p>Sign in on another phone to keep your profile, friends and playlists with you.</p><div className="device-info">Registration does not indicate whether a device is currently online.</div><p>Open a device to see its details. Viewing it does not change your current device.</p></section></div>
    <section className="shared-devices"><h2>Devices shared with you</h2>{received.length ? received.map(device => <article className="shared-device" key={device.delegationId}><DeviceIcon desktop={device.platform === 'WEB'} /><div><strong>{device.model || 'Unnamed device'}</strong><small>{platformName(device.platform)} · Shared by {device.owner.name}</small></div></article>) : <p>No friends have shared a device with you.</p>}<p className="device-caption">Use a shared device from its owner’s accessible playlist to play tracks remotely. Sonora must be open on that device.</p></section>
    <div className="devices-list-heading"><h2>Attached devices</h2><button className="device-secondary" disabled={loading || deleting} onClick={() => setReload(n => n + 1)}>↻ Refresh devices</button></div>
    {notice && <div className="device-notice auth-success" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
    {loading && <p role="status">Loading devices…</p>}
    {loadError && <div className="auth-error" role="alert">{loadError}<button className="device-secondary" onClick={() => setReload(n => n + 1)}>Retry</button></div>}
    {!loading && !loadError && !devices.length && <div className="devices-empty"><DeviceIcon /><h2>No devices attached yet.</h2><p>Sign in to Sonora on your phone, then refresh this list.</p><button className="button" onClick={() => setAdding(true)}>Add a device</button></div>}
    <div className="devices-grid">{devices.map(device => <button className="device-tile" key={device.id} aria-label={`View details for ${device.model || 'device'}`} disabled={deleting} onClick={() => { setDetails(device); setConfirming(false); setDeleteError(''); }}><span className="device-symbol"><DeviceIcon desktop={device.platform === 'WEB'} /></span><span className="device-identity"><strong>{device.model || 'Unnamed device'}</strong><small>{platformName(device.platform)} · {device.id === client.currentDeviceId ? 'This device' : 'Registered device'}</small></span><span className="device-chevron" aria-hidden="true"><ArrowIcon direction="chevron" /></span></button>)}</div>
    {(page > 1 || devices.length === DEVICE_PAGE_SIZE) && <nav className="devices-pagination" aria-label="Device pages"><button disabled={loading || deleting || page === 1} onClick={() => setPage(n => n - 1)}><ArrowIcon direction="left" /> Previous</button><span>Page {page}</span><button disabled={loading || deleting || devices.length < DEVICE_PAGE_SIZE} onClick={() => setPage(n => n + 1)}>Next <ArrowIcon direction="right" /></button></nav>}
    {adding && <DeviceDialog title="Add a device" onClose={close}><p>Open Sonora in another browser or on your iPhone or Android phone and sign in to this account. The installation is registered automatically.</p><p>Return here and select Refresh devices.</p><button className="button" onClick={close}>Got it</button></DeviceDialog>}
    {details && <DeviceDialog title={confirming ? 'Detach device?' : 'Device details'} onClose={close} busy={deleting || delegationBusy}><div className="device-detail-identity"><DeviceIcon desktop={details.platform === 'WEB'} /><h3>{details.model || 'Unnamed device'}</h3></div><dl><dt>Platform</dt><dd>{platformName(details.platform)}</dd><dt>App version</dt><dd>{details.appVersion || 'Not available'}</dd><dt>Registered</dt><dd>{details.createdAt && Number.isFinite(Date.parse(details.createdAt)) ? new Date(details.createdAt).toLocaleDateString() : 'Not available'}</dd></dl>{details.id !== client.currentDeviceId && <p className="device-info">Detaching revokes this device’s Sonora sessions. It will be signed out through its live connection or next API request; an offline device is denied when it reconnects.</p>}{!confirming && <section className="delegation-list"><h3>Control access</h3>{delegations.map(item => <div className="shared-device" key={item.id}><div><strong>{item.delegate.name}</strong><small>Can control this device</small></div><button className="device-secondary" disabled={delegationBusy} onClick={() => void changeDelegation(details, item.delegateUserId, true)}>Revoke</button></div>)}{friends.filter(friend => !delegations.some(item => item.delegateUserId === friend.id)).map(friend => <div className="shared-device" key={friend.id}><div><strong>{friend.name}</strong><small>{friend.username ? `@${friend.username}` : 'Friend'}</small></div><button className="device-secondary" disabled={delegationBusy} onClick={() => void changeDelegation(details, friend.id, false)}>Grant</button></div>)}{!friends.length && <p>Add friends before sharing device control.</p>}<p className="device-caption">Control access is limited to friends. Remote playback is available from their accessible playlists while this device is online.</p></section>}<div className="device-dialog-actions">{confirming ? <><button className="device-danger" disabled={deleting} onClick={() => void remove(details)}>{deleting ? 'Detaching…' : 'Confirm detach'}</button><button className="device-secondary" disabled={deleting} onClick={() => { setConfirming(false); setDeleteError(''); }}>Cancel</button></> : details.id === client.currentDeviceId ? <p>Use Log out in the sidebar to end this browser session.</p> : <button className="device-danger" onClick={() => setConfirming(true)}>Detach device</button>}</div></DeviceDialog>}
  </section>;
}
function DeviceIcon({ desktop = false }: { desktop?: boolean }) { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{desktop ? <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M8 21h8" /></> : <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4M11 19h2" /></>}</svg>; }
function DeviceDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className="device-dialog" aria-labelledby="device-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}><header><h2 id="device-dialog-title">{title}</h2><button className="device-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></header>{children}</dialog>;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ApiClient, User } from '../../api/client';
import { client, restoreSession, browserInfo } from '../../api/instance';

const Context = createContext<{ client: ApiClient; user: User | null }>({ client, user: null });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(client.user);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = client.subscribe(setUser);
    void restoreSession().catch(() => undefined).finally(() => { if (active) { setUser(client.user); setReady(true); } });
    return () => { active = false; unsubscribe(); };
  }, []);
  const [deviceError, setDeviceError] = useState('');
  useEffect(() => {
    let active = true;
    setDeviceError('');
    if (user) void client.registerDevice(browserInfo.platform, browserInfo.model, browserInfo.appVersion).catch(() => { if (active) setDeviceError('Browser registration failed. Your next action will retry.'); });
    return () => { active = false; };
  }, [user?.id]);
  if (!ready) return <main><p role="status">Restoring your session…</p></main>;
  return <Context.Provider value={{ client, user }}>{deviceError && <p role="alert" className="auth-error">{deviceError}</p>}{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);

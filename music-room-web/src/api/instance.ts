import { browserDeviceName } from './browser-device';
import { ApiClient } from './client';
import { config } from '../lib/config';

const installationKey = 'sonora.installation.v1';
const serverKey = 'sonora.server.url.v1';
// Installation metadata persists across tabs; credentials never enter localStorage.
const storageFor = (key: string) => key === installationKey || key === serverKey ? localStorage : sessionStorage;
export const browserInfo = { platform: 'WEB' as const, model: browserDeviceName(navigator.userAgent, navigator.platform, navigator.maxTouchPoints), appVersion: '0.1.0' };
// Refresh token only, scoped to this tab. Access tokens stay in memory.
const savedServer = localStorage.getItem(serverKey);
export const client = new ApiClient(savedServer || config.apiUrl, {
  getItem: async key => storageFor(key).getItem(key),
  setItem: async (key, value) => { storageFor(key).setItem(key, value); },
  deleteItem: async key => { storageFor(key).removeItem(key); },
}, undefined, browserInfo, () => { const saved = localStorage.getItem(installationKey); if (saved) return saved; const id = crypto.randomUUID(); localStorage.setItem(installationKey, id); return id; });
// One restoration even when React StrictMode mounts effects twice.
let restoration: Promise<void> | undefined;
export const restoreSession = () => restoration ??= client.restore();

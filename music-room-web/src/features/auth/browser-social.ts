type GoogleSdk = { accounts: { id: {
  initialize(options: { client_id: string; callback: (result: { credential?: string }) => void; auto_select: boolean; ux_mode: string }): void;
  renderButton(element: HTMLElement, options: Record<string, string | number>): void;
} } };
declare global { interface Window { google?: GoogleSdk } }
const scripts = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  const existing = scripts.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail(), 15000);
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Unable to load social sign-in. Check your connection or browser content blocker, then retry.')); };
    script.src = src; script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.append(script);
  });
  scripts.set(src, promise);
  void promise.catch(() => scripts.delete(src));
  return promise;
}
let googleCallback: ((token: string) => void) | null = null;
let googleInitialized = false;
export async function prepareGoogle(clientId: string) {
  if (!clientId) throw new Error('Google sign-in is not configured for this website.');
  await loadScript('https://accounts.google.com/gsi/client');
  if (!window.google) throw new Error('Google sign-in is unavailable. Please retry.');
  if (!googleInitialized) {
    window.google.accounts.id.initialize({ client_id: clientId, auto_select: false, ux_mode: 'popup', callback: result => { if (result.credential) googleCallback?.(result.credential); } });
    googleInitialized = true;
  }
  return window.google;
}
export function receiveGoogle(callback: (token: string) => void) {
  googleCallback = callback;
  return () => { if (googleCallback === callback) googleCallback = null; };
}

/** Descriptive hints only; identity comes from the random installation UUID. */
export function browserDeviceName(ua: string, platform = '', touchPoints = 0): string {
  const os = /iPad/i.test(ua) || (/Mac/i.test(platform) && touchPoints > 1) ? 'iPad'
    : /iPhone|iPod/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS/i.test(ua) ? 'Mac'
    : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS\//i.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}`;
}

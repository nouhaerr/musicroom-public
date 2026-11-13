import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserDeviceName } from '../src/api/browser-device.ts';
for (const [ua, platform, touch, expected] of [
  ['Mozilla Macintosh Mac OS X Version/18 Safari/605', 'MacIntel', 0, 'Mac · Safari'],
  ['Mozilla Windows NT 10 Chrome/130 Safari/537 Edg/130', 'Win32', 0, 'Windows · Edge'],
  ['Mozilla iPhone CriOS/130 Safari/605', 'iPhone', 5, 'iPhone · Chrome'],
  ['Mozilla Macintosh Safari/605', 'MacIntel', 5, 'iPad · Safari'],
  ['Mozilla Android Chrome/130 Safari/537', 'Linux', 5, 'Android · Chrome'],
  ['', '', 0, 'Device · Browser'],
] as const) test(expected, () => assert.equal(browserDeviceName(ua, platform, touch), expected));

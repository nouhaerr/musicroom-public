import { ArrowIcon } from '../../components/ui/ArrowIcon';

// The few icons of the rooms pages, drawn in the colour of the text around them
const paths = {
  music: <><path d="M9 17V5l10-2v12" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="6.5" cy="17" r="2.5" fill="currentColor" /><circle cx="16.5" cy="15" r="2.5" fill="currentColor" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" /><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" /></>,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" />,
  check: <path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" strokeWidth="2.4" />,
  play: <path d="M8 5l11 7-11 7z" fill="currentColor" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="2" /></>,
  grip: <><circle cx="9" cy="7" r="1.6" fill="currentColor" /><circle cx="15" cy="7" r="1.6" fill="currentColor" /><circle cx="9" cy="12" r="1.6" fill="currentColor" /><circle cx="15" cy="12" r="1.6" fill="currentColor" /><circle cx="9" cy="17" r="1.6" fill="currentColor" /><circle cx="15" cy="17" r="1.6" fill="currentColor" /></>,
  people: <><circle cx="9" cy="8" r="3" fill="currentColor" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" fill="currentColor" /><circle cx="17" cy="9" r="2.4" fill="currentColor" /><path d="M15.5 13.6c2.9.2 5.5 2.1 5.5 5.4h-4" fill="currentColor" /></>,
  broadcast: <><circle cx="12" cy="12" r="2.4" fill="currentColor" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.8 4.8a10.2 10.2 0 0 0 0 14.4M19.2 4.8a10.2 10.2 0 0 1 0 14.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | 'chevron' | 'up'; size?: number }) {
  if (name === 'chevron') return <ArrowIcon direction="chevron" size={size} />;
  if (name === 'up') return <ArrowIcon direction="up" size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

import { ArrowIcon } from '../ui/ArrowIcon';
import { useEffect, useState } from 'react';
import './sidebar.css';
import logo from '../../assets/logo.png';
import { useAuth } from '../../features/auth/AuthProvider';
import { AuthStory } from '../../features/auth/AuthStory';
import '../../features/auth/auth.css';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightFromBracket } from '@fortawesome/free-solid-svg-icons';
const links = [['/', 'Home'], ['/rooms', 'Rooms'], ['/playlists', 'Playlists'], ['/playlist-invitations', 'Playlist invitations'], ['/friends', 'Friends'], ['/devices', 'Devices'], ];
export function AppLayout() {
  const { user, client } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    let notice = 'You are logged out.';
    try { await client.logout(); } catch (error) { notice = error instanceof Error ? error.message : 'Logged out locally.'; }
    navigate('/auth/login', { replace: true, state: { notice } });
    setLoggingOut(false);
  }
  const { pathname } = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => { setNavigationOpen(false); }, [pathname]);
  const isHome = pathname === '/';
  const auth = (!user && isHome) || pathname.startsWith('/auth/');
  if (auth) return <div className="auth-shell"><a className="skip-link" href="#main">Skip to content</a><header className="auth-header"><NavLink to="/" className="brand"><img src={logo} alt="" className="brand-logo" /><span>Sonora</span></NavLink><span className="header-caption">ONE ROOM. EVERYONE’S SOUND.</span><NavLink to={isHome ? "/auth/register" : "/"}>{isHome ? "Create an account" : "Back to home"} <ArrowIcon direction="up-right" /></NavLink></header><main id="main" className="auth-main" tabIndex={-1}><div className="auth-grid"><AuthStory /><Outlet /></div></main><footer className="auth-footer"><span>© {new Date().getFullYear()} Sonora</span><span>Made for the moments in between.</span></footer></div>;
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a>
    <aside className="app-sidebar" aria-label="Sonora navigation" onKeyDown={e => { if (e.key === 'Escape') setNavigationOpen(false); }}>
      <div className="sidebar-brand-row"><NavLink to="/" className="brand"><img src={logo} alt="" className="brand-logo" /><span>Sonora</span></NavLink>
        <button type="button" className="sidebar-toggle" aria-label="Toggle navigation" aria-expanded={navigationOpen} aria-controls="sidebar-navigation" onClick={() => setNavigationOpen(value => !value)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={navigationOpen ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg></button>
      </div>
      <nav id="sidebar-navigation" className={navigationOpen ? 'sidebar-navigation is-open' : 'sidebar-navigation'} aria-label="Main navigation"><p className="sidebar-label">YOUR SPACE</p>{links.filter(([to]) => !user || to !== '/').map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}><NavigationIcon name={label} /><span>{label}</span></NavLink>)}
        {user ? <div className="sidebar-bottom"><NavLink to="/profile" className="sidebar-profile"><NavigationIcon name="Account" /><span>Account<small>{user.name}</small></span></NavLink><button type="button" className="sidebar-logout" disabled={loggingOut} onClick={() => void logout()}><NavigationIcon name="Logout" /><span>{loggingOut ? 'Logging out…' : 'Log out'}</span></button></div> : <NavLink to="/auth/login"><NavigationIcon name="Account" /><span>Log in</span></NavLink>}
      </nav>
    </aside>
    <div className="app-content"><main id="main" tabIndex={-1}><Outlet /></main><footer>Sonora · Good music. Better together.</footer></div>
  </div>;
}

function NavigationIcon({ name }: { name: string }) {
  if (name === 'Logout') return <FontAwesomeIcon icon={faArrowRightFromBracket} aria-hidden="true" />;
  const paths: Record<string, string> = {
    Account: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
    Home: 'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
    Rooms: 'M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M12 10v4',
    Playlists: 'M3 5h12M3 10h9M3 15h6M17 5v12M17 5l4-1v4l-4 1M17 17c0 4-6 4-6 1s6-4 6-1',
    Friends: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M22 21v-3a4 4 0 0 0-3-4M17 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    Devices: 'M7 2h10v20H7zM10 5h4M11 19h2',
    'Playlist invitations': 'M4 5h16M4 12h10M4 19h7M17 15v6M14 18h6',
  };
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

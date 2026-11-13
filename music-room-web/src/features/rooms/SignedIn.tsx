import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

// The rooms and playlists pages are for signed-in people: the others go to the login page, which brings them to the rooms
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/auth/login" replace />;
}

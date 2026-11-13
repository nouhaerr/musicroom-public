import type { ReactNode } from 'react';
import { client } from '../../api/instance';
import { live } from '../../realtime/instance';
import { SignedIn } from './SignedIn';
import { DiscoverPage } from './DiscoverPage';
import { RoomPage } from './RoomPage';
import { CreateRoomPage } from './CreateRoomPage';
import { PlaylistsPage } from '../playlists/PlaylistsPage';
import { PlaylistPage } from '../playlists/PlaylistPage';
import { CreatePlaylistPage } from '../playlists/CreatePlaylistPage';
import { AccessPeoplePage } from '../access/AccessPeoplePage';
import { PlaylistInvitationsPage } from '../invitations/PlaylistInvitationsPage';

// The rooms and playlists pages, by route, for the pages table of App.tsx. Each one is for signed-in people.
export const musicPages: Record<string, ReactNode> = {
  '/rooms': <SignedIn><DiscoverPage client={client} /></SignedIn>,
  '/rooms/new': <SignedIn><CreateRoomPage client={client} /></SignedIn>,
  '/rooms/:roomId': <SignedIn><RoomPage client={client} live={live} /></SignedIn>,
  '/playlists': <SignedIn><PlaylistsPage client={client} /></SignedIn>,
  '/playlists/new': <SignedIn><CreatePlaylistPage client={client} /></SignedIn>,
  '/playlists/:playlistId': <SignedIn><PlaylistPage client={client} live={live} /></SignedIn>,
  '/playlists/:playlistId/access': <SignedIn><AccessPeoplePage client={client} /></SignedIn>,
  '/playlist-invitations': <SignedIn><PlaylistInvitationsPage /></SignedIn>,
};

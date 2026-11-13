import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCheck, faChevronRight, faLock, faMusic, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { ApiClient } from '../api/client';
import { PLAYLISTS_PAGE_SIZE, playlistsApi, type Playlist, type PlaylistCard, type PlaylistInvitation } from '../api/playlists';
import type { AnimatedRef } from 'react-native-reanimated';
import type { Live } from '../realtime/live';
import { Action, styles } from '../components/ProfileUI';
import { CreatePlaylistScreen } from './CreatePlaylistScreen';
import { PlaylistScreen } from './PlaylistScreen';

const SEARCH_DELAY_MS = 400; // the search starts once the typing stops for this long
const CHIPS: { visibility: Playlist['visibility']; label: string; empty: string }[] = [
  { visibility: 'PUBLIC', label: 'Public', empty: 'No public playlists yet.' },
  { visibility: 'PRIVATE', label: 'Private', empty: 'No private playlists yet. The ones you create or are invited to show here.' },
];

// The Playlists tab: the playlists you may see, one chip at a time, found by name, and the way into one of them
export function PlaylistsScreen({ client, live, pageScroll }: { client: ApiClient; live: Live; pageScroll: AnimatedRef }) {
  const api = useMemo(() => playlistsApi(client), [client]);
  const [visibility, setVisibility] = useState<Playlist['visibility']>('PUBLIC');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [playlists, setPlaylists] = useState<PlaylistCard[] | null>(null); // null until the first answer: never a false empty list
  const [invitations, setInvitations] = useState<PlaylistInvitation[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0); // counts the reloads asked for: back from a playlist, "Try again"
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const query = text.trim();

  // Load a page of playlists. A new search waits for the typing to stop; a late answer is ignored.
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      void Promise.all([api.list(page, query, visibility), api.myInvitations()]).then(([found, incoming]) => {
        if (!active) return;
        setInvitations(incoming.filter(invite => invite.status === 'PENDING' && invite.playlist?.visibility === 'PRIVATE'));
        const privatePendingIds = new Set(incoming.filter(invite => invite.status === 'PENDING' && invite.playlist?.visibility === 'PRIVATE').map(invite => invite.playlistId));
        setPlaylists(found.filter(playlist => !privatePendingIds.has(playlist.id)));
      })
        .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load the playlists.'); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? SEARCH_DELAY_MS : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [api, page, query, visibility, reload]);

  async function answerInvitation(invitation: PlaylistInvitation, accept: boolean) {
    if (answering) return;
    setAnswering(invitation.id); setError('');
    try {
      await api.answer(invitation.id, accept);
      if (accept && invitation.playlist.visibility === 'PRIVATE') {
        setVisibility('PRIVATE'); setText(''); setPage(1); setPlaylists(null);
      }
      setReload(value => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to answer this invitation.');
    } finally {
      setAnswering(null);
    }
  }

  if (creating) return <CreatePlaylistScreen client={client} onCreated={id => { setCreating(false); setPlaylistId(id); }} onBack={() => setCreating(false)} />;
  if (playlistId) return <PlaylistScreen client={client} live={live} pageScroll={pageScroll} playlistId={playlistId} onBack={() => { setPlaylistId(null); setReload(n => n + 1); }} />;

  const chip = CHIPS.find(each => each.visibility === visibility)!;
  const card = (playlist: PlaylistCard) => <Pressable key={playlist.id} accessibilityRole="button" accessibilityLabel={`Open ${playlist.name}`} onPress={() => setPlaylistId(playlist.id)} style={p.card}>
    {playlist.cover ? <Image source={{ uri: playlist.cover }} style={p.cover} />
      : <View style={[p.cover, p.blank]}><FontAwesomeIcon icon={playlist.visibility === 'PRIVATE' ? faLock : faMusic} color="#A9B6FF" size={20} /></View>}
    <View style={p.grow}>
      <Text style={p.name} numberOfLines={1}>{playlist.name}</Text>
      <Text style={styles.text} numberOfLines={1}>{playlist.songsCount} {playlist.songsCount === 1 ? 'track' : 'tracks'} · by {playlist.owner.id === client.user?.id ? 'you' : playlist.owner.name}</Text>
      <Text style={p.rule} numberOfLines={1}>{playlist.visibility === 'PUBLIC' ? 'Public' : 'Private'} · {playlist.editLicense === 'OWNER_ONLY' ? 'Owner edits' : playlist.editLicense === 'EVERYONE' ? 'Everyone edits' : 'Invitees edit'}</Text>
    </View>
    <FontAwesomeIcon icon={faChevronRight} color="#737D91" size={14} />
  </Pressable>;

  return <View style={styles.section}>
    <View style={p.top}>
      <View style={p.heading}>
        <Text style={p.eyebrow}>YOUR PLAYLISTS</Text>
        <Text style={p.title}>Made together.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Create a playlist" onPress={() => setCreating(true)} style={({ pressed }) => [p.plus, pressed && p.dim]}>
        <FontAwesomeIcon icon={faPlus} color="#A9B6FF" size={24} />
      </Pressable>
    </View>
    <TextInput accessibilityLabel="Search playlists" placeholder="Search playlists" placeholderTextColor="#737D91" value={text}
      onChangeText={value => { setText(value); setPage(1); }} maxLength={100} autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={styles.input} />
    <View style={p.chips}>{CHIPS.map(each => <Pressable key={each.visibility} accessibilityRole="tab" accessibilityState={{ selected: visibility === each.visibility }}
      onPress={() => { if (visibility !== each.visibility) { setVisibility(each.visibility); setPage(1); setPlaylists(null); } }} style={[p.chip, visibility === each.visibility && p.chosen]}>
      <Text style={[p.chipText, visibility === each.visibility && p.chosenText]}>{each.label}</Text>
    </Pressable>)}</View>
    {invitations.length > 0 ? <View style={p.inviteBox}>
      <Text style={p.inviteHeading}>Private playlist invitations</Text>
      <Text style={styles.text}>Accept the invitation to see this playlist in your Private playlists.</Text>
      {invitations.map(invitation => <View key={invitation.id} style={p.inviteRow}>
        <View style={p.grow}><Text style={p.name} numberOfLines={1}>{invitation.playlist.name}</Text><Text style={styles.text} numberOfLines={1}>Invited by {invitation.invitedBy.name}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${invitation.playlist.name} invitation`} disabled={!!answering} onPress={() => void answerInvitation(invitation, true)} style={[p.inviteAction, p.accept, answering && p.dim]}>
          <FontAwesomeIcon icon={faCheck} color="#F3F3E9" size={16} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${invitation.playlist.name} invitation`} disabled={!!answering} onPress={() => void answerInvitation(invitation, false)} style={[p.inviteAction, p.decline, answering && p.dim]}>
          <FontAwesomeIcon icon={faXmark} color="#F3F3E9" size={17} />
        </Pressable>
      </View>)}
    </View> : null}
    {error ? <View style={p.gap}>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      <Action title="Try again" secondary onPress={() => setReload(n => n + 1)} />
    </View> : null}
    {playlists === null ? (loading ? <ActivityIndicator color="#B7F576" accessibilityLabel="Loading the playlists" /> : null) : <>
      {playlists.length === 0 && !loading ? <Text style={styles.text}>{query ? 'No playlist matches this search.' : chip.empty}</Text> : null}
      {playlists.map(card)}
      {page > 1 || playlists.length === PLAYLISTS_PAGE_SIZE ? <View style={p.pages}>
        <Action title="Previous" secondary disabled={page === 1 || loading} onPress={() => setPage(n => n - 1)} />
        <Action title="Next" secondary disabled={playlists.length < PLAYLISTS_PAGE_SIZE || loading} onPress={() => setPage(n => n + 1)} />
      </View> : null}
    </>}
  </View>;
}

const p = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, gap: 3 },
  plus: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, // only the +, with a finger-sized area to tap
  dim: { opacity: 0.5 },
  grow: { flex: 1, gap: 3 },
  eyebrow: { color: '#A98BFF', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  title: { color: '#F3F3E9', fontSize: 32, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#242D3E' },
  chosen: { backgroundColor: '#1E2A5C' },
  chipText: { color: '#B4BDCE', fontWeight: '600' },
  chosenText: { color: '#A9B6FF' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: '#171A25' },
  cover: { width: 56, height: 56, borderRadius: 10 },
  blank: { backgroundColor: '#242D3E', alignItems: 'center', justifyContent: 'center' },
  name: { color: '#F3F3E9', fontSize: 17, fontWeight: '700' },
  rule: { color: '#A9B6FF', fontSize: 13 },
  pages: { flexDirection: 'row', gap: 12 },
  gap: { gap: 8 },
  inviteBox: { gap: 10, padding: 16, borderRadius: 18, backgroundColor: '#171A25', borderWidth: 1, borderColor: '#34384A' },
  inviteHeading: { color: '#F3F3E9', fontSize: 18, fontWeight: '700' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  inviteAction: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: '#4961EE' }, decline: { backgroundColor: '#34384A' },
});

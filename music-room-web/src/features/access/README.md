# Access

The playlist owner page at `/playlists/:playlistId/access` manages public or
private visibility, everyone or invitees-only editing, invitations, and
collaborator removal. Public playlists are visible to everyone; private
playlists are visible only to the owner and invited users. The subject does not
require invitations to be restricted to friends, so the search can invite any
registered user. A pending invitation is not access: the invitee must accept
before a private playlist and its songs become visible. For a private playlist,
“Everyone with access” means the owner and accepted invitees; “Invited people
only” lets accepted invitees edit, while “Only me” lets invited people listen
without editing. “Everyone with access” includes any viewer on a public
playlist. Playlist
invitees can review public and private invitations at
`/playlist-invitations`. The owner profile is loaded separately so their
avatar is displayed too.

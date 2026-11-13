# Devices

`DevicesPage` lists the signed-in account's registrations using `GET /devices`
(20 per page). Device details use a keyboard-accessible native dialog. Clicking a
row only opens details; it does not select a playback target or change the current
device. Detach requires confirmation and calls `DELETE /devices/:id`.

Registration is not online status. Detach revokes sessions associated with that device;
a client is signed out through its real-time connection or next API request, and an offline
client is denied when it reconnects. Signing in again intentionally registers the device
again. The web client registers with platform WEB. The installation UUID persists in
localStorage, separately from tab-scoped credentials. Device names are descriptive hints,
not hardware identification.

The add-device action explains how to sign in on another phone. Server errors keep
a retry path; success feedback dismisses after 10 seconds. Device list pagination,
empty/loading states and responsive layouts are included.

## Control delegation

Open a device's details to grant or revoke control for a current friend. The
**Devices shared with you** section lists incoming grants. Access is scoped to
one device and is revoked when the owner detaches that device or either person
ends the friendship. The API emits `device:control-changed` to both users so the
page refreshes without a manual reload. On an accessible playlist owned by that
friend, choose one of their shared devices and use the broadcast icon beside a
track to play its Deezer preview there. The target Sonora app/browser must be open
and online. Browsers may require the target user to click **Enable sound** once
because of autoplay restrictions. Offline commands are not queued, and playback is
a short preview rather than full-track streaming.

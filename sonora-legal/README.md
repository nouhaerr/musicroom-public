# Sonora legal information pages

Standalone static site, separate from `music-room-api`. It has no database
access, scripts, or access to the `.env` file.

## Files

- `index.html`: home page.
- `privacy-policy.html`: draft privacy policy.
- `data-deletion.html`: draft instructions for requesting deletion by email.
- `styles.css`: shared styling adapted for phones.

## View locally

From the repository root:

```sh
python3 -m http.server 8086 --bind 127.0.0.1 --directory sonora-legal
```

- http://127.0.0.1:8086/privacy-policy.html
- http://127.0.0.1:8086/data-deletion.html

These are local addresses and cannot be used as public URLs in Meta. The server
exposes only this directory, never the repository root or backend.

## Before publication

1. Replace every “To be completed” note with accurate information: data
   controller, hosting, service providers, retention, deletion scope, and
   processing time.
2. Confirm that `grpsonora.music@gmail.com` is monitored and that the team has
   an effective process for handling data deletion requests.
3. Review the content and remove the draft warnings.
4. Host only this directory on a public HTTPS site.
5. Check that both pages are publicly accessible without signing in.

For Meta, choose the **User Data Deletion** instructions option and provide the
public URL for `data-deletion.html`. This page is not an automatic deletion
callback.

These files do not create public hosting or active public URLs. This draft is
not legal approval or Meta approval.

# Authentication

Email forms are implemented in AuthPage.tsx; AuthProvider supplies the shared API client and user; AccountPage verifies the current profile and handles logout.

Manual checks: register with a real test email; log in before verification and resend; verify using the email link; log in; request/reset the password; check a consumed reset link is rejected; log out and confirm account access redirects to login. Reload restores the session from the tab-scoped refresh token. Verify logout followed by reload stays signed out.

Google sign-in is integrated for the web; Facebook native sign-in is available
in the mobile app. Web device registrations, profile/social linking, and reset
email links targeting the web are implemented. Browser refresh tokens are
tab-scoped in `sessionStorage`; they do not persist after a normal tab close.
Native SDKs are not imported into this client.

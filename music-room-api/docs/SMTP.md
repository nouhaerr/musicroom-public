# Sending email with Gmail SMTP

The backend sends verification and password-reset emails with Nodemailer.
`MAIL_TRANSPORT=log` prints links during development; `smtp` sends real messages
without writing tokens to logs.

## 1. Prepare Gmail

1. Enable 2-Step Verification for the sender's Google account.
2. Open [App passwords](https://myaccount.google.com/apppasswords).
3. Create a password named **Music Room**.
4. Copy the password into `.env`, without the spaces used for display.

Use an app password, not your normal Google password. If the option is missing,
check work/school account restrictions, Advanced Protection, or whether 2-Step
Verification is limited to security keys. See [Google's official help](https://support.google.com/accounts/answer/185833?hl=en).

## 2. Configure `.env`

Edit only the mail section of `music-room-api/.env`, without replacing other
variables. Do not put credentials in `.env.example` or Git.

```dotenv
MAIL_TRANSPORT=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=465
MAIL_SECURE=true
MAIL_USER=your-address@gmail.com
MAIL_PASSWORD=your_app_password_without_spaces
MAIL_FROM="Music Room <your-address@gmail.com>"
APP_URL=http://localhost:3000
```

For this first test, use the same Gmail address for `MAIL_USER` and `MAIL_FROM`.
Port 465 uses immediate TLS (`MAIL_SECURE=true`). For port 587, use
`MAIL_SECURE=false`; the backend then requires STARTTLS. Certificates are verified.
See [Nodemailer documentation](https://nodemailer.com/smtp).

`APP_URL` is the API address used by the browser that opens the link. `localhost`
works on the Mac hosting the API. On a phone, use the Mac's reachable network
address. In deployment, use the public HTTPS address.

## 3. Reload and check

From `music-room-api`, with Docker running:

```bash
make
docker compose exec backend npm run mail:check
docker compose exec backend npm run mail:test
```

`make` installs new dependencies into the image and renews anonymous dependency
volumes; the named PostgreSQL volume is preserved. `mail:check` verifies
connection and authentication without sending email. `mail:test` checks the
connection, then sends email to `MAIL_USER` (this test command assumes the SMTP
username is an email address, as with Gmail). Check the inbox and spam folder:
SMTP acceptance does not guarantee delivery to the main inbox.

After changing only `.env`:

```bash
docker compose up -d --no-deps --force-recreate backend
```

A plain `docker compose restart` does not reload variables from `env_file`.

## 4. Test authentication in Swagger

1. Open http://localhost:3000/docs.
2. Call `POST /auth/register` with an address you can access, a name, and a
   password of at least 8 characters. If the account already exists but is not
   verified, call `POST /auth/resend-verification` with its `email`.
3. Open the email, then open the verification link on the Mac. The API responds
   “Email verified successfully.”
4. Call `POST /auth/login` with that address and password.
5. To test reset, call `POST /auth/forgot-password`. The web/mobile form is not
   available yet: copy the `token` parameter from the email link, then send it
   with `newPassword` to `POST /auth/reset-password` in Swagger.

SMTP mode does not require a Google OAuth client or a Prisma schema change.

## Troubleshooting

- `EAUTH`: check the account and app password; changing your Google password
  revokes existing app passwords.
- `ETIMEDOUT`, `ECONNECTION`, `EDNS`, `ESOCKET`, `ETLS`: check the network, host
  name, and port/TLS combination. Do not disable certificate verification.
- Signup returns 503: the account may already have been created. Fix SMTP and
  resend verification instead of registering the same account again.
- Generic response for resend/reset: it does not confirm delivery. Check spam
  and `make logs`. SMTP errors are shown by code only.

Automated tests mock SMTP and do not send external email.

# MoneyWise Web

Family budget tracking app with Google Sheets sync and Google sign-in based access control.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run the app:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

## Vercel Environment Variables

Add these variables in Vercel Project Settings -> Environment Variables:

1. `GOOGLE_SCRIPT_URL`:
   your deployed Google Apps Script Web App URL.
2. `MONEYWISE_SECRET`:
   shared secret that must match `SECRET` in your Apps Script code.
3. `GOOGLE_CLIENT_ID`:
   Google OAuth Web Client ID used to verify ID tokens in the server API.
4. `ALLOWED_EMAILS`:
   comma-separated allowlist, for example:
   `test@gmail.com,test1@gmail.com`
5. `VITE_GOOGLE_CLIENT_ID`:
   same value as `GOOGLE_CLIENT_ID`, exposed to the frontend for Google Sign-In.

## Security Model

1. Frontend gets a Google ID token after login.
2. Frontend sends token to `/api/sheet` in `Authorization: Bearer <token>`.
3. Vercel API verifies token + checks `ALLOWED_EMAILS`.
4. Only then API forwards request to Apps Script with server-side `MONEYWISE_SECRET`.

This prevents anonymous users from calling your sheet sync endpoint.

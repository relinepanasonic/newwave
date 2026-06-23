# Google Drive Setup (one-time, ~10 minutes)

The app uploads KTP photos and live-report screenshots into your HRD Drive folder
`16J8ZA8R0nc0IshWnJpKv1a0mhksZ44ji`, creating one sub-folder per host (named after
the host). To do this, the app's server needs to log in to Google **as you** using a
**refresh token**. (Sharing the folder "anyone with link can edit" is NOT enough — that
only works for people clicking in a browser, not for the app's server.)

We use an OAuth **refresh token** (not a service account) on purpose: a service account
uploading into a personal Gmail Drive fails with *"Service Accounts do not have storage
quota"*. With your own refresh token, files are owned by you and just work.

## Step 1 — Create OAuth credentials in Google Cloud

1. Go to https://console.cloud.google.com/ and create a project (e.g. "NW Schedule").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Fill App name + your email. Save.
   - **Audience / Test users** → add your Google account email (`relinepanasonic@gmail.com`).
     (Test mode is fine — the token won't expire as long as you keep using the app.)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs → add: `https://developers.google.com/oauthplayground`
   - Create. **Copy the Client ID and Client Secret.**

## Step 2 — Get a refresh token (OAuth Playground)

1. Open https://developers.google.com/oauthplayground
2. Click the **gear icon (⚙)** top-right → check **"Use your own OAuth credentials"** →
   paste your **Client ID** and **Client Secret**.
3. Left panel: in **"Input your own scopes"** paste:
   `https://www.googleapis.com/auth/drive`
   then click **Authorize APIs**.
4. Sign in with the **same Google account that owns the Drive folder** → Allow.
5. Click **"Exchange authorization code for tokens"**.
6. **Copy the Refresh token** (starts with `1//`).

## Step 3 — Add 4 env vars in Vercel

Project → **Settings → Environment Variables** → add these (Production + Preview):

| Name | Value |
|------|-------|
| `GOOGLE_OAUTH_CLIENT_ID` | from Step 1 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | from Step 1 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | from Step 2 |
| `GDRIVE_ROOT_FOLDER_ID` | `16J8ZA8R0nc0IshWnJpKv1a0mhksZ44ji` |

Then **Redeploy**.

## Done

After redeploy:
- Every **new host** onboarding auto-creates `MyDrive/Apps New Wave/HRD/<Host Name>/`
  and uploads their KTP there. The HRD table's **Link GDrive** column shows **"Folder Host"**.
- Every **live report** screenshot is mirrored into that same host folder, named
  `host.datelive.brandname.platform.ext`.

If the env vars are missing, the app simply skips Drive (no errors) and keeps using
Supabase Storage as before.

# Project Setup

One-time configuration for the three external integrations. Work through each
section in order -- CI/CD depends on the Google Cloud project already existing
when you reach it.

---

## 1. Gemini API Key

The Gemini API key enables AI resume import and AI autofill assist inside the
extension. It is entered by the user in Settings and is never required for the
extension to function.

1. Go to [Google AI Studio](https://aistudio.google.com/api-keys).
2. Click **Create API key**.
3. Copy the key.

That key is what users paste into **Settings > AI Features** inside the
extension. No further configuration is needed on your end.

---

## 2. CI/CD (Chrome Web Store Automated Releases)

Pushing a `v*.*.*` tag triggers the Release workflow, which builds the
extension and uploads it to the Chrome Web Store. The workflow needs four
secrets stored in a GitHub **environment** named `production`.

### 2a. Enable the Chrome Web Store API

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select
   the **Job Buddy** project.
2. Go to **APIs & Services > Library**.
3. Search for **Chrome Web Store API** and click **Enable**.

### 2b. Create an OAuth client for GitHub Actions

1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Set **Application type** to **Desktop app**.
4. Name it `GitHub Actions CI/CD`.
5. Click **Create** and save the **Client ID** and **Client Secret**.

### 2c. Find your Chrome Web Store Extension ID

Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
The Extension ID is the 32-character string in the listing URL:

```
https://chrome.google.com/webstore/detail/.../<EXTENSION_ID>
```

### 2d. Generate a refresh token

Run this locally -- it opens a browser window to authorise the Google account
that owns the Chrome Web Store listing.

```bash
npx chrome-webstore-upload-keys
```

When prompted:

1. Paste the **Client ID** and **Client Secret** from step 2b.
2. Sign in with the account that owns the CWS listing.
3. If Google shows a warning that the app is unverified, click **Advanced**
   then **Go to Job Buddy (unsafe)**. This is expected for internal tools.
4. Copy the **Refresh Token** from the browser.

The refresh token does not expire unless you revoke it from
[Google account permissions](https://myaccount.google.com/permissions).

### 2e. Add GitHub environment secrets

1. In the repository on GitHub, go to **Settings > Environments**.
2. Create an environment named `production`.
3. Inside it, add the following secrets under **Environment secrets**:

| Secret name            | Value                              |
| ---------------------- | ---------------------------------- |
| `CHROME_EXTENSION_ID`  | From step 2c                       |
| `CHROME_CLIENT_ID`     | From step 2b                       |
| `CHROME_CLIENT_SECRET` | From step 2b                       |
| `CHROME_REFRESH_TOKEN` | From step 2d                       |

Once these are in place, use `/ship` in Claude Code to cut a release. It runs
tests, proposes a version bump, waits for confirmation, then commits, tags, and
pushes. The Release workflow takes over from there.

---

## 3. Google Drive Cloud Backup

The Drive backup feature lets users sync their profile to a private app folder
in Google Drive. It uses `chrome.identity.launchWebAuthFlow`, which requires
**Web Application** OAuth clients -- one for local development and one for
production.

### 3a. Enable the Google Drive API

1. In [Google Cloud Console](https://console.cloud.google.com/), select the
   **Job Buddy** project.
2. Go to **APIs & Services > Library**.
3. Search for **Google Drive API** and click **Enable**.

### 3b. Find your extension IDs for redirect URIs

Each OAuth client needs a redirect URI in the format:

```
https://<EXTENSION_ID>.chromiumapp.org/
```

You need two IDs -- one for the dev build and one for the production build.

**Dev extension ID:**
1. Open your regular Chrome browser (not a Chromium dev instance).
2. Go to `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked**, navigate to the project folder, and select
   `.output/chrome-mv3-dev` (press `Command + Shift + .` to show hidden
   folders on macOS).
4. Copy the Extension ID shown on the loaded extension card.

**Production extension ID:**
This is the same ID from step 2c (the Chrome Web Store listing ID).

### 3c. Create OAuth clients for Drive

1. Go to **APIs & Services > Credentials > OAuth consent screen**.
2. Click **Clients**, then create two clients:

**Client 1 -- Local development:**
- Application type: **Web application**
- Name: `Job Buddy Extension - Local`
- Authorized redirect URIs: `https://<DEV_EXTENSION_ID>.chromiumapp.org/`
- Save the **Client ID** and **Client Secret**

**Client 2 -- Production:**
- Application type: **Web application**
- Name: `Job Buddy Extension - Production`
- Authorized redirect URIs: `https://<PROD_EXTENSION_ID>.chromiumapp.org/`
- Save the **Client ID** and **Client Secret**

### 3d. Set environment variables

Copy `.env.example` to create your local env files and fill in the client IDs:

```bash
cp .env.example .env.development
cp .env.example .env.production
```

In `.env.development`:
```
VITE_GOOGLE_DRIVE_CLIENT_ID=<Client ID from Job Buddy Extension - Local>
```

In `.env.production`:
```
VITE_GOOGLE_DRIVE_CLIENT_ID=<Client ID from Job Buddy Extension - Production>
```

The client secrets are not used by the extension itself -- only the client IDs
are embedded at build time.

### 3e. Add test users

While the OAuth consent screen is in **Testing** status, only explicitly added
accounts can complete the Google sign-in flow.

1. Go to **APIs & Services > OAuth consent screen > Audience**.
2. Under **Test users**, click **Add users**.
3. Add the email address of the Google account you want to use for testing
   Drive backup.

### 3f. Test the Drive connection

Load the dev build in your **regular Chrome browser** (not the Chromium
instance that the `pnpm dev` command opens -- Google restricts OAuth in
Chromium dev environments).

1. Open the extension's **Settings** page.
2. Click **Connect Google Drive**.
3. Complete the sign-in flow. If the app warning appears, click **Advanced >
   Go to Job Buddy (unsafe)**.

### 3g. Publish the OAuth app (before releasing to users)

While the consent screen is in Testing status, users outside your test user
list cannot connect Drive. Before publishing the extension publicly:

1. Go to **APIs & Services > OAuth consent screen**.
2. Click **Publish app**.

This allows any Google account to authorise the Drive connection without
needing to be added as a test user first.

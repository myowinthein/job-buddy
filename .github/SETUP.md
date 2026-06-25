# Automated Release Setup

One-time configuration for the `Release` workflow. Once these are in place,
pushing a `v*.*.*` tag automatically builds the extension, uploads it to the
Chrome Web Store, submits for review, and creates a GitHub Release.

## 1. Find your Chrome Web Store Extension ID

After the extension is published (or in draft) at the [Chrome Web Store
developer dashboard](https://chrome.google.com/webstore/devconsole), each
item has a 32-character ID visible in its URL:

```
https://chrome.google.com/webstore/detail/.../<EXTENSION_ID>
```

Copy that value — it becomes the `CHROME_EXTENSION_ID` secret.

## 2. Enable the Chrome Web Store API

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Navigate to **APIs & Services → Library**.
4. Search for **Chrome Web Store API** and click **Enable**.

## 3. Create OAuth 2.0 credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. If prompted, configure the OAuth consent screen (External, just fill the
   required fields; you don't need to publish it).
3. Application type: **Desktop app**.
4. Name it (e.g. `Job Buddy Release CLI`) and **Create**.
5. Copy the **Client ID** and **Client Secret** — these become the
   `CHROME_CLIENT_ID` and `CHROME_CLIENT_SECRET` secrets.

## 4. Generate a refresh token

Run locally — the OAuth flow opens a browser window and asks you to
authorise the Google account that owns the Chrome Web Store listing.

```bash
npx chrome-webstore-upload-keys
```

Follow the prompts:

1. Paste the `Client ID` and `Client Secret` from step 3.
2. Visit the URL it prints, sign in with the **publisher's** Google account,
   and copy the authorisation code back to the terminal.
3. The tool prints a **Refresh Token** — this becomes the
   `CHROME_REFRESH_TOKEN` secret.

The refresh token does not expire unless you revoke it from the Google
account's [security settings](https://myaccount.google.com/permissions).

## 5. Add GitHub repository secrets

In the repository on GitHub → **Settings → Secrets and variables → Actions
→ New repository secret**, add all four:

| Secret name             | Value from step |
| ----------------------- | --------------- |
| `CHROME_EXTENSION_ID`   | 1               |
| `CHROME_CLIENT_ID`      | 3               |
| `CHROME_CLIENT_SECRET`  | 3               |
| `CHROME_REFRESH_TOKEN`  | 4               |

## 6. Cut a release

```bash
pnpm release
```

The script prints commits since the last tag, suggests `patch` / `minor`
/ `major`, lets you override, bumps `package.json`, commits, tags, and
pushes. The `Release` workflow takes over from the tag push:

1. Builds the production zip
2. Uploads to the Chrome Web Store and submits for review (`--auto-publish`)
3. Creates a GitHub Release with auto-generated notes and the zip attached

Chrome Web Store review typically takes a few hours to a few days. The
upload itself fails fast if any secret is wrong — check the `Release` run
in **Actions** to debug.

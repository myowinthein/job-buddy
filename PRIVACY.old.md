# Privacy Policy — Job Buddy

**Effective date:** June 22, 2026

Job Buddy is a browser extension that helps you fill out job application
forms using information you provide once, in your own profile. This policy
explains what information Job Buddy stores, how it's used, and — just as
importantly — what it does *not* do.

## Summary

Job Buddy has no servers of its own. By default it operates entirely on
your device — everything stays in your browser's local storage. Three
optional features can send data off-device, and only if you explicitly
enable them:

- **Cloud Backup** uploads your profile to your own Google Drive.
- **AI Resume Import** sends a CV/resume file you choose to Google's
  Gemini API for extraction.
- **AI Autofill assist** sends form-field metadata together with your
  profile to Google's Gemini API when a form has fields the rule-based
  autofill couldn't confidently resolve.

All three are off until you turn them on. Each is described in detail
below. Job Buddy itself never stores your data and is not a party to
your connection with Google.

## What information Job Buddy stores

When you fill out your profile in Job Buddy's Options page, the following
categories of information are saved to your browser's local storage so the
extension can use them to autofill job application forms:

- **Personal information** — name, email address, phone number, date of
  birth, and optional EEO/diversity disclosure fields (gender, ethnicity,
  veteran status, disability status). These fields are optional, provided
  voluntarily by you, and exist solely because many job application forms
  include equivalent equal-opportunity employment questions. Job Buddy uses
  them only to autofill the corresponding fields on a job application page
  you choose to fill.
- **Address** — street, city, state/province, postal code, and country.
- **Professional summary** — a career summary and notice period you write
  yourself.
- **Salary information** — your current salary and any expected salary
  figures you enter, including currency.
- **Work authorization status** — your work authorization status, visa
  type, and visa expiry per country, if you choose to provide it.
- **Work history** — company names, job titles, dates, locations, work
  arrangement, and descriptions for roles you add.
- **Education** — institutions, degrees, fields of study, dates, and
  descriptions for entries you add.
- **Languages** — languages and proficiency levels you list.
- **Links** — LinkedIn, portfolio, and other links you choose to add.
- **Documents** — if you upload a CV/resume file in the Documents section,
  the file is stored on-device as encoded file data alongside the rest of
  your profile. It is not transmitted anywhere by default. If you have
  enabled Cloud Backup, the file is included as part of the profile JSON
  uploaded to your own Google Drive (see Cloud Backup below).

In addition, Job Buddy stores several supporting categories of data
generated automatically as you use the extension or change settings:

- **Learned field mappings** — when you manually select a profile field
  for a form field Job Buddy didn't confidently recognize, it remembers
  that pairing for that website's domain (for example, "on example.com,
  the field labeled 'First Name' maps to your profile's first name"). This
  is stored per-domain and contains only field-name-to-profile-field
  associations — never the values you entered, and never the content of
  the page itself.
- **AI settings** — if you opt in to the AI features (Resume Import or
  AI Autofill assist), Job Buddy stores the Gemini API key you provide
  and the selected model in your browser's local storage so the features
  can authenticate with Google's API on your behalf. The key is never
  included in profile export bundles and never transmitted to anyone
  other than Google's Gemini API.
- **Cloud Backup state** — if you connect Google Drive, Job Buddy stores
  the OAuth access token and a small amount of bookkeeping (the backup
  file's Drive ID, the last sync timestamp, and whether a retry is
  pending) in your browser's local storage. The token is never included
  in profile export bundles.
- **Appearance preference** — your System / Light / Dark choice for the
  extension's UI is saved locally so it persists across sessions.
- **Application history** — Job Buddy's storage schema reserves a slot
  for tracking applications you've submitted. This feature is not yet
  active in the current version; nothing is currently written to it.

## What information Job Buddy does **not** do

- **Job Buddy makes no network requests by default.** Out of the box, the
  extension runs entirely on your device. Network access only happens
  through the three opt-in features described below (Cloud Backup, AI
  Resume Import, AI Autofill assist), and only when you've configured
  them. Job Buddy does not operate its own servers, never stores your
  data, and has no backend, analytics, or tracking SDKs of any kind.
- **Your data is never sold or shared.** Nothing you enter into your
  profile leaves your device through Job Buddy except through opt-in
  features you turn on — and even then, the connection is directly from
  your browser to Google's API (Drive or Gemini), with no third party in
  the middle.
- **Your data is not synced through your Google account by default.** Job
  Buddy uses your browser's local, on-device storage only — not Chrome's
  account-sync storage. Your profile will not automatically appear on
  other devices or browsers unless you opt in to Cloud Backup. If you
  prefer to move your profile manually, you can do so using the Export
  Profile / Import Profile feature in Settings, which produces a JSON
  file under your control.

## How Job Buddy accesses web pages

Job Buddy includes a content script that can run on web pages so that,
when you click "Auto Fill," it can scan the page for fillable form fields
and fill them using your profile. Because job applications can appear on
virtually any website, this script is present broadly rather than limited
to a specific list of sites — which is why, during installation, Chrome
may show a permission notice describing access to "your data on all
websites."

In practice, this script does nothing on its own. It only scans or fills
a page when you actively click Auto Fill (or interact with the in-page
field picker) in that tab. It does not read, monitor, or transmit page
content in the background, and it does not act without you initiating it.

One exception, scoped to fields you have already chosen to autofill: if
your profile is updated while a job application tab is open, Job Buddy
may automatically fill fields it previously identified but had no value
for — without re-filling or changing any fields it already handled. No
new fields are detected, no new scans are run, and the behavior is
confined to fields from the Auto Fill run you started yourself.

## Cloud Backup (optional)

Cloud Backup is an opt-in feature in Settings that lets you sync your
Job Buddy profile to your own Google Drive account so you can restore it
on another browser or after reinstalling the extension. It is off until
you explicitly connect a Google account.

When enabled:

- Authentication uses Google's standard OAuth flow. Job Buddy requests
  only the `https://www.googleapis.com/auth/drive.appdata` scope, which
  grants access to a dedicated, hidden application-data folder inside
  your Google Drive — not your general Drive contents.
- The backup is stored as a single JSON file (`job-buddy-profile.json`)
  in that hidden `appDataFolder`. This folder is **not visible in the
  regular Google Drive UI**; only the Job Buddy extension, signed in
  with the same Google account, can read or write files inside it.
- Sync is one-directional: your local profile is the source of truth.
  After a successful save in the Options page, Job Buddy uploads the
  latest profile to your Drive. Drive never overwrites your local data
  silently — restoring from Drive is always explicit, via the restore
  dialog shown when you connect.
- Your OAuth token is stored only in your browser's local extension
  storage and is never included in any export bundle. Disconnecting from
  Settings revokes the token and, at your choice, deletes the backup
  file from your Drive.
- Job Buddy never sends any of your data to a server operated by us or
  by any third party. The connection is strictly between your browser
  and Google's Drive API.

## AI features (optional)

Job Buddy includes two AI-assisted features that use Google's Gemini
API. Both are off until you paste a Gemini API key into Settings →
AI Features. The key is yours — you obtain it directly from
[Google AI Studio](https://aistudio.google.com/api-keys), and Job Buddy
stores it only in your browser's local extension storage. Job Buddy
itself has no AI service; everything goes from your browser straight to
Google's API using your key.

**AI Resume Import.** When you upload a PDF or DOCX résumé through the
Import Resume dialog, the file is sent to the Gemini API as base64
inline data along with a prompt asking it to extract structured profile
fields. The extracted suggestions are shown to you in a review screen
where you accept or reject each one — nothing is written to your profile
until you confirm. The file itself is not retained by Job Buddy unless
you separately accept the "Resume File" entry in the review screen, in
which case it is saved to your local profile under Documents (and, if
Cloud Backup is enabled, included in your Drive backup).

**AI Autofill assist.** When you click Auto Fill, the rule-based pipeline
runs first. Any fields it couldn't confidently resolve — together with
your profile JSON — are sent to the Gemini API so it can suggest matches.
The picker overlay highlights those AI-resolved fields and you can edit
or override before submitting the form. The form fields' labels, names,
and surrounding text are sent; the entire HTML of the page is not.

What this means for your data:
- The contents of any résumé you import, and the contents of your
  profile when you use AI Autofill on a form, are processed by Google
  under their API terms. Job Buddy is not in the middle of that
  connection and never receives a copy.
- If you do not provide a Gemini API key, neither AI feature ever runs
  and no data is sent to the Gemini API.
- Clearing the key from Settings stops all future AI requests.

## Permissions Job Buddy requests, and why

| Permission | Why it's needed |
|---|---|
| `storage` | To save your profile, learned field mappings, AI settings, theme preference, and Cloud Backup state in your browser's local storage. |
| `tabs` | To identify the tab you're currently viewing and send it the Auto Fill / Clear / Status commands when you click the corresponding buttons in the popup. Not used to read your browsing history or activity across tabs. |
| `identity` | To perform the Google OAuth flow if you opt in to Cloud Backup. Used only when you click Connect Google Drive in Settings; never used otherwise. |
| Content script on all pages | To allow the Auto Fill and field-picker features to work on whatever job application page you're using, only when you trigger them. |
| Host access to `https://www.googleapis.com/*` | Used by Cloud Backup to upload, download, and delete your backup file inside Drive's hidden application-data folder. Only active while you are connected to Drive. |
| Host access to `https://oauth2.googleapis.com/*` | Used to revoke your Google OAuth token when you disconnect Drive from Settings. |
| Host access to `https://generativelanguage.googleapis.com/*` | Used by the optional AI features to send résumé/profile data to your own Gemini API endpoint. Never used unless you have configured a Gemini API key. |

Job Buddy does not request access to your browsing history, bookmarks,
cookies, downloads, or any other browser data, and does not request any
permission beyond what's listed above.

## Your control over your data

- You can view, edit, or delete any part of your profile at any time from
  the Options page.
- You can export your full profile as a JSON file, or import one, from
  Settings.
- Uninstalling the extension, or clearing your browser's extension
  storage, permanently removes all data Job Buddy has stored.

## Changes to this policy

If Job Buddy's data practices change in a future version — for example,
if a feature is added that requires network access — this policy will be
updated accordingly, and the updated version will be reflected in the
extension's Chrome Web Store listing.

## Contact

Job Buddy is an open-source project. If you have questions about this
policy or how your data is handled, please open an issue on the GitHub
repository:

**https://github.com/myowinthein/job-buddy/issues**

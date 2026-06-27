# Privacy Policy — Job Buddy

**Effective date:** June 27, 2026

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
below. Job Buddy itself never stores your data on its own servers and is
not a party to your connection with Google.

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
  that pairing for that website's domain. This is stored per-domain and
  contains only field-name-to-profile-field associations — never the
  values you entered, and never the content of the page itself.
- **AI settings** — if you opt in to the AI features, Job Buddy stores
  the Gemini API key you provide and the selected model in your browser's
  local storage. The key is never included in profile export bundles and
  never transmitted to anyone other than Google's Gemini API.
- **Cloud Backup state** — if you connect Google Drive, Job Buddy stores
  the OAuth access token and a small amount of bookkeeping (the backup
  file's Drive ID, the last sync timestamp, and whether a retry is
  pending) in your browser's local storage. The token is never included
  in profile export bundles.
- **Appearance preference** — your System / Light / Dark theme choice is
  saved locally so it persists across sessions.
- **Application history** — Job Buddy's storage schema includes an
  `applicationHistory` key that is reserved but currently unused. Nothing
  is written to it and it is included in profile export bundles for
  forward compatibility only.

## Special category data (GDPR)

The optional EEO/diversity fields — gender, ethnicity, veteran status, and
disability status — are special category data under Article 9 of the GDPR.
Job Buddy processes this data solely on the basis of your explicit consent,
expressed by voluntarily entering these values into your profile. This data
is stored only on your device, is never transmitted to Job Buddy's servers
(which do not exist), and is sent to third-party APIs only through the
opt-in features you activate. You can delete any of these fields at any
time from the Options page.

## What Job Buddy does **not** do

- **Job Buddy makes no network requests by default.** Out of the box, the
  extension runs entirely on your device. Network access only happens
  through the three opt-in features described below.
- **Your data is never sold or shared.** Nothing you enter leaves your
  device through Job Buddy except through opt-in features — and even then,
  the connection is directly from your browser to Google's API, with no
  third party in the middle.
- **Your data is not synced through your Google account by default.** Job
  Buddy uses your browser's local, on-device storage only — not Chrome's
  account-sync storage. Your profile will not appear on other devices
  unless you opt in to Cloud Backup.

## How Job Buddy accesses web pages

Job Buddy includes a content script that can run on web pages so that,
when you click "Auto Fill," it can scan the page for fillable form fields
and fill them using your profile. This script is present broadly rather
than limited to a specific list of sites — which is why Chrome may show a
permission notice describing access to "your data on all websites."

In practice, this script does nothing on its own. It only scans or fills
a page when you actively click Auto Fill in that tab. It does not read,
monitor, or transmit page content in the background, and it does not act
without you initiating it.

One exception, scoped to fields you have already chosen to autofill: if
your profile is updated while a job application tab is open, Job Buddy may
automatically fill fields it previously identified but had no value for —
without re-filling or changing any fields it already handled.

## Cloud Backup (optional)

When enabled, Cloud Backup syncs your profile to your own Google Drive
using the `https://www.googleapis.com/auth/drive.appdata` scope. This
scope grants access only to a hidden application-data folder inside your
Drive — not your general Drive contents. The backup file is not visible in
the regular Google Drive UI.

Sync is one-directional: your local profile is the source of truth. Drive
never overwrites your local data silently — restoring from Drive is always
explicit. Your OAuth token is stored only in your browser's local extension
storage and is never included in any export bundle. Disconnecting from
Settings revokes the token and, at your choice, deletes the backup file
from your Drive.

## AI features (optional)

Job Buddy includes two AI-assisted features that use Google's Gemini API.
Both are off until you paste a Gemini API key into Settings → AI Features.
The key is yours — you obtain it directly from
[Google AI Studio](https://aistudio.google.com/api-keys).

**AI Resume Import.** When you upload a PDF or DOCX résumé, the file is
sent to the Gemini API as base64 inline data along with a prompt asking it
to extract structured profile fields. Extracted suggestions are shown in a
review screen where you accept or reject each one — nothing is written to
your profile until you confirm.

**AI Autofill assist.** After the rule-based autofill runs, any fields it
couldn't confidently resolve — together with your profile JSON — are sent
to the Gemini API for matching. The form fields' labels, names, and
surrounding text are sent; the entire HTML of the page is not.

If you do not provide a Gemini API key, neither AI feature runs and no
data is sent to the Gemini API. Clearing the key from Settings stops all
future AI requests. Data sent to the Gemini API is processed by Google
under their API terms — Job Buddy is not in the middle of that connection
and never receives a copy.

## Permissions Job Buddy requests, and why

| Permission | Why it's needed |
|---|---|
| `storage` | To save your profile, learned field mappings, AI settings, theme preference, and Cloud Backup state in your browser's local storage. |
| `tabs` | To identify the tab you're currently viewing and send it the Auto Fill / Clear / Status commands when you click the corresponding buttons in the popup. |
| `identity` | To perform the Google OAuth flow if you opt in to Cloud Backup. Used only when you click Connect Google Drive in Settings. |
| Content script on all pages | To allow the Auto Fill and field-picker features to work on whatever job application page you're using, only when you trigger them. |
| Host access to `https://www.googleapis.com/*` | Used by Cloud Backup to upload, download, and delete your backup file inside Drive's hidden application-data folder. |
| Host access to `https://oauth2.googleapis.com/*` | Used to revoke your Google OAuth token when you disconnect Drive from Settings. |
| Host access to `https://generativelanguage.googleapis.com/*` | Used by the optional AI features. Never used unless you have configured a Gemini API key. |

## Your rights under GDPR

If you are located in the European Economic Area (EEA), you have the
following rights over your personal data:

- **Access** — you can view all data Job Buddy holds by opening the
  Options page, or by using Settings → Export Profile to download a full
  JSON copy.
- **Rectification** — you can edit any field in your profile at any time
  from the Options page.
- **Erasure** — you can delete individual profile fields, or use Settings
  → Reset All Data to permanently remove everything Job Buddy has stored.
  Uninstalling the extension also permanently deletes all local data.
- **Portability** — Settings → Export Profile produces a JSON file
  containing your profile, learned mappings, and application history that
  you can import into another instance of Job Buddy.
- **Withdraw consent** — for special category data (gender, ethnicity,
  veteran status, disability status), you can delete those fields at any
  time; withdrawal does not affect the lawfulness of processing before
  withdrawal.

Because Job Buddy stores data exclusively in your own browser's local
storage and has no backend, these rights are exercised directly within
the extension itself — no request to the developer is required.

## Data retention

Your data is retained in your browser's local storage for as long as you
keep the extension installed and do not delete it. There is no automatic
expiry. Learned field mappings are retained indefinitely unless you reset
all data. Uninstalling the extension removes all locally stored data.

If you have connected Google Drive, your Drive backup is retained until
you disconnect and choose to delete the file, or until you delete it
manually from your Google account.

## Changes to this policy

If Job Buddy's data practices change in a future version, this policy will
be updated and the updated version will be reflected in the extension's
Chrome Web Store listing.

## Contact

Job Buddy is an open-source project. For questions about this policy or
how your data is handled, please open an issue on the GitHub repository:

**https://github.com/myowinthein/job-buddy/issues**

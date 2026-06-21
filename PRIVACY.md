# Privacy Policy — Job Buddy

**Effective date:** [INSERT DATE OF FIRST PUBLICATION]

Job Buddy is a browser extension that helps you fill out job application
forms using information you provide once, in your own profile. This policy
explains what information Job Buddy stores, how it's used, and — just as
importantly — what it does *not* do.

## Summary

Job Buddy operates entirely on your device. It does not have a server, it
does not send your data anywhere, and it does not share your data with any
third party. Everything described below stays in your browser's local
storage, on the computer you installed the extension on, unless you
explicitly export it yourself.

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
  your profile. It is never uploaded or transmitted anywhere.

In addition, Job Buddy stores two supporting categories of data that are
generated automatically as you use the extension:

- **Learned field mappings** — when you manually select a profile field
  for a form field Job Buddy didn't confidently recognize, it remembers
  that pairing for that website's domain (for example, "on example.com,
  the field labeled 'First Name' maps to your profile's first name"). This
  is stored per-domain and contains only field-name-to-profile-field
  associations — never the values you entered, and never the content of
  the page itself.
- **Application history** — Job Buddy's storage schema reserves a slot
  for tracking applications you've submitted. This feature is not yet
  active in the current version; nothing is currently written to it.

## What information Job Buddy does **not** do

- **Job Buddy makes no network requests of any kind.** It does not contact
  any server operated by us or by anyone else. There is no backend, no
  analytics, and no tracking SDKs of any kind built into the extension.
- **Your data is never transmitted, sold, or shared.** Nothing you enter
  into your profile leaves your device through Job Buddy.
- **Your data is not synced through your Google account.** Job Buddy uses
  your browser's local, on-device storage only — not Chrome's account-sync
  storage. Your profile will not automatically appear on other devices or
  browsers. If you want to move your profile to another device, you can do
  so manually using the Export Profile / Import Profile feature in
  Settings, which produces a JSON file under your control.
- **The Resume Import feature does not retain your file.** When you use
  Import Resume to extract details from an existing PDF or DOCX resume,
  only the extracted text is used, temporarily, to help you populate your
  profile. The original file is not saved. (This is separate from
  uploading a CV in the Documents section, described above, which is
  saved on-device.)

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

## Permissions Job Buddy requests, and why

| Permission | Why it's needed |
|---|---|
| `storage` | To save your profile, learned field mappings, and related settings in your browser's local storage. |
| `tabs` | To identify the tab you're currently viewing and send it the Auto Fill / Clear / Status commands when you click the corresponding buttons in the popup. Not used to read your browsing history or activity across tabs. |
| Content script on all pages | To allow the Auto Fill and field-picker features to work on whatever job application page you're using, only when you trigger them. |

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

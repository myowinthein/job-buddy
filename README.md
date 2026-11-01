# Job Buddy _(job-buddy)_

AI-powered job application assistant browser extension

Save your profile once and use Job Buddy to fill supported job application forms.
It stores your profile in your browser. A Gemini API key is required for autofill
and resume import; Google Drive backup is optional.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Integrations](#integrations)
- [Development](#development)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Install

Install Job Buddy from the [Chrome Web Store](https://chromewebstore.google.com/detail/job-buddy/oaadklbdofbaanfcijknaehfkbekdmbk).

To run from source, install Node.js 22 (see [.nvmrc](.nvmrc)) and pnpm 11.7.0, then:

```bash
git clone https://github.com/myowinthein/job-buddy.git
cd job-buddy
pnpm install
pnpm dev
```

In Chrome, open `chrome://extensions/`, enable **Developer mode**, click **Load
unpacked**, and select `.output/chrome-mv3-dev/`. Keep `pnpm dev` running while
developing. Set up Gemini to use autofill and resume import. Google Drive setup is optional.

## Usage

```text
Set Up Profile → Set Up AI Autofill → Fill Form → Review answers → Submit on the application site
```

1. Open the extension popup and choose **Set Up Profile**, **Complete Profile**, or **Edit Profile**.
   Save your personal details, work history, education, and other relevant sections.
   Add a CV in **Documents** to attach it to supported upload fields.
   Open uploaded PDFs with **View PDF**, or use **Download** to save PDF and Word attachments.
   Unsaved edits show a warning before you leave a section or close the profile page.
   The top bar tracks 10 required checks after saving; select a remaining detail
   to go to its input. Optional details do not affect the percentage.
2. Choose **Set Up AI Autofill** and save a Gemini key in **Settings → AI Features**.
   Then visit a job application page and click **Fill Form** in the popup.
3. If the form already contains values, choose **Fill empty fields** to keep existing values
   or **Replace matched values** to use your saved details, then click **Fill Form**.
4. Review the results and type any missing or corrected answers directly into the
   form. Submit the application yourself on the website.

On the application form, colors describe individual field confidence:

| Result                      | Meaning                                                   |
| --------------------------- | --------------------------------------------------------- |
| Green / High confidence     | Filled with high confidence; still check the answer.      |
| Yellow / Review value       | Filled with lower confidence; review and correct it.      |
| Red / Not matched           | Left unfilled because no confident match was found.       |
| Gray / Missing profile data | Your profile lacks the value; the field has no highlight. |

Popup messages share one area below the main buttons. Blue indicates setup or
loading, gray an informational outcome, green completed fills, amber a result
needing review or input, and red a failed action. Fill Form stays on the left;
Undo or Cancel sits on the right.

If AI assistance is unavailable during a fill, the popup warns you to review the
results. Existing rule-based fills remain, and **Undo** is still available.

The popup shows a compact result summary. Choose **View Fill Log** for detected
fields, rule fills, AI handoffs, and final outcomes across the form's frames.
Use **Fields** to search, filter, or inspect how an individual answer was handled.
Processing-stage counts can overlap when AI refines a rule-filled value; final
totals count each field or question group once. Kept answers and consent questions
are separate from unfilled fields.

The log follows edits on the source form and keeps only its latest run in memory.
Reloading or closing the form discards it. It records field metadata, not profile
values, uploaded document contents, or API keys.

**Undo** clears Job Buddy's fills for the current session. Corrections that match
saved profile values can teach the extension a field mapping for that website.
Review or edit these in **Learned Mappings**.

Compatibility depends on the site's controls. Some custom fields cannot be filled;
check every answer and uploaded document before submitting.

## Integrations

- **Gemini (required for autofill and resume import):** add your own API key in **Settings → AI Features** for AI autofill
  assistance and PDF/DOCX resume import. Select **Save Key** to verify and save it.
  Keys remain in this browser and are excluded from JSON and Drive backups.
  Use **Replace Key** or **Remove Key** to manage access. Review imported suggestions
  before saving. Updating from a resume keeps saved entries and missing details.
  Local checks reject unreadable PDF/DOCX files before sending. Gemini also checks
  document purpose: unrelated documents stop, and uncertain results need confirmation
  before review. Slow, rate-limited, or unavailable models fall back automatically.
- **Google Drive:** connect in **Settings** to back up your profile and learned
  mappings. Saved changes update the backup automatically. Use **Back Up Now**
  to check and update it manually. Different Drive data requires review before
  replacement. Temporary failures retry with increasing delays; Google may ask
  you to reconnect. History, appearance, and Gemini settings stay in this browser.
- **JSON backup:** use **Export Profile** and **Import Profile** in **Settings** to
  transfer your profile, learned mappings, and application history.

Disconnecting keeps the last successful Drive backup unless you choose to delete
it. Keeping a backup does not upload unsynced changes first. A failed cloud
deletion must be retried before a reset can clear this browser.

Valid JSON backups import immediately into an empty profile. Resume, JSON, and Drive
imports show **Update current profile** and **Replace current profile** only for a
possible name/email mismatch. Empty profiles and matching identities use the normal
import flow. Update keeps omitted details;
JSON and Drive lists replace supplied lists, while resume updates retain saved
entries. The shared review lets you select individual jobs, education entries,
languages, and custom links. New entries show their details; changed entries
compare current and incoming values in both Update and Replace.
Updated mappings and JSON application history merge with saved data.

Replace starts fresh with the selected incoming details and clears old documents,
mappings, and history unless imported. Appearance and AI settings stay in this
browser. Replacing from a resume or JSON pauses connected Drive backups until you
review the saved backup in Settings.

AI autofill sends profile details and form fields to Google's Gemini API, excluding
stored document files. Personal background details are included only when a field
asks for them. Resume import sends the selected file and extracted hyperlinks; the
current profile stays local for review. Drive
backup uploads your profile and learned mappings to Google. Read the
[privacy policy](docs/legal/privacy/index.html) and
[autofill and AI disclaimer](docs/legal/disclaimer/index.html) before using these features.
See [Project Setup](.github/SETUP.md) for integration configuration.

## Development

The extension uses WXT, React, TypeScript, and Tailwind CSS v4, with Vitest for tests.

Restart `pnpm dev` after adding a new extension page so WXT discovers and emits
its HTML file. Already-open forms may keep an earlier content script; refresh
the form before testing a changed autofill flow. The Fill Log explains when an
earlier script cannot supply detailed records.

| Command              | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm dev`           | Start Chrome extension development.                                 |
| `pnpm dev:preview`   | Preview the profile UI with sample data at `http://127.0.0.1:4173`. |
| `pnpm compile`       | Check TypeScript without emitting files.                            |
| `pnpm lint`          | Run ESLint.                                                         |
| `pnpm test:run`      | Run the test suite once.                                            |
| `pnpm build`         | Build the production Chrome extension.                              |
| `pnpm zip`           | Build and package a Chrome Web Store archive.                       |
| `pnpm serve:landing` | Serve the static website at `http://localhost:3000`.                |

Browser tests use Playwright with an isolated Chromium profile and synthetic local forms.
Install the browser once with `pnpm exec playwright install chromium`, then run
`pnpm test:browser`. This builds the extension and runs headless tests. After a build,
use `pnpm exec playwright test --headed` to see the browser while debugging.
Normal edits do not start browser tests.

The localhost profile preview uses the existing Options UI with in-memory sample
data. Use **Sample profile** or **Empty profile** to review completion states.
Profile saves last until you refresh the page; Appearance is remembered. It does not access your installed
extension's data, load environment files, or connect to Gemini or Google Drive.
Use it to review profile forms and layout; extension autofill and real integrations
still require an unpacked extension.

Development builds also include **Dev Tools** in the sidebar. Inspect local JSON,
completion checks, storage usage, and diagnostics, or run profile, resume, AI, and
Drive scenarios. Scenarios open the real interface with temporary storage and
simulated providers. **Exit Simulation** returns to live inspection. Refreshing
a simulation restarts it; production builds exclude these tools.

Chrome builds are under `.output/`. Firefox development, build, and packaging
scripts are also available in [package.json](package.json); production distribution
targets Chrome.

## Documentation

- [Project Setup](.github/SETUP.md): Gemini, Drive OAuth, and release configuration.
- [Website](docs/index.html) and [project overview](docs/project-site/index.html).

## Contributing

Ask questions, report bugs, or suggest features through
[GitHub Issues](https://github.com/myowinthein/job-buddy/issues).
Project development uses direct commits to `main` rather than a pull request workflow.
Before committing code changes, run `pnpm compile`, `pnpm lint`, `pnpm test:run`, and
`pnpm build`; these are also the CI checks.

## License

[MIT](LICENSE) © 2026 Myo Win Thein (Martin).

<!-- last-reviewed: 80054c5fef2789f50223b7a134e940e3efd9981c -->

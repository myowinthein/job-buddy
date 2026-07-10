# Job Buddy

> Fill job application forms in one click using your saved profile. Works across any site, no account required.

[![CI](https://github.com/myowinthein/job-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/myowinthein/job-buddy/actions/workflows/ci.yml)

Job Buddy is a Chrome extension that reads any job application form, matches each field to your saved profile, and fills what it can — with color-coded confidence on every answer. Set up your profile once; stop retyping the same information across hundreds of applications.

All data stays in your browser's local storage. No server, no account, no tracking.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Optional features](#optional-features)
- [Contributing](#contributing)
- [License](#license)

## Install

**From the Chrome Web Store (recommended):**

[Add Job Buddy to Chrome](https://chromewebstore.google.com/detail/job-buddy/oaadklbdofbaanfcijknaehfkbekdmbk)

**For development:**

Requires Node 22 and pnpm.

```bash
git clone https://github.com/myowinthein/job-buddy.git
cd job-buddy
pnpm install
pnpm dev
```

Then open `chrome://extensions`, enable Developer Mode, click **Load unpacked**, and select `.output/chrome-mv3-dev/`.

To build for Firefox:

```bash
pnpm build:firefox
```

## Usage

1. Click the Job Buddy icon in your toolbar and open **Options**.
2. Fill in your profile: personal info, work history, education, salary expectations, work authorization, and links.
3. Visit any job application page, click the Job Buddy icon, and press **Fill Form**.

Job Buddy scans every field on the page, runs a four-layer matching pipeline (learned mappings, HTML autocomplete attributes, dictionary matching, fuzzy text), and fills what it can confidently.

**Confidence colors:**

| Color | Meaning |
|---|---|
| Green | High confidence, filled automatically |
| Yellow | Medium confidence, worth a quick review |
| Red | Low confidence, pick your value from the picker overlay |
| Gray | Field matched but your profile is missing that value |

Click any highlighted field to open the picker and choose a different value. Job Buddy learns from your corrections and improves future fills on the same site.

To undo all fills, click **Undo** in the popup.

## Optional features

**AI-assisted autofill:** When a field can't be matched by rules alone (red or gray), Gemini resolves it from context — job title, nearby labels, and your profile. Requires a Gemini API key (set under Settings → AI Features).

**Résumé import:** Upload a PDF or DOCX in Options and Job Buddy extracts your work history, education, and contact details for review before saving. Also requires a Gemini API key.

**Cloud Backup:** Sync your profile to a private folder in your own Google Drive. Restore to any machine instantly. Requires a one-time Google OAuth sign-in under Settings. Optional setup: copy `.env.example` to `.env.development` and `.env.production` and fill in your Google OAuth client ID (see comments in `.env.example`).

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/myowinthein/job-buddy/issues).

For code changes, run the full check suite before submitting:

```bash
pnpm compile   # TypeScript type-check
pnpm lint      # ESLint
pnpm test:run  # Vitest
```

## License

[MIT](LICENSE) © 2026 Myo Win Thein

<!-- last-reviewed: 87a3a2ac94059fc7f1476f8bf80c245dc6b4e865 -->

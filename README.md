# Job Buddy

**Autofill job application forms in seconds.**

Job Buddy is a free, open-source Chrome extension that fills job application forms automatically using a profile you set up once. Stop retyping the same name, email, address, and work history into every application.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/EXTENSION_ID?label=Chrome%20Web%20Store)](https://chrome.google.com/webstore/detail/EXTENSION_ID)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/myowinthein)

---

![Job Buddy autofill in action](docs/screenshots/autofill-preview.png)
*Replace with your actual screenshot path after uploading to the repo*

---

## Features

- **One-click autofill** — click Auto Fill and Job Buddy fills every field it can, instantly
- **Confidence-based highlighting** — green/yellow/red/gray indicators show exactly which fields need your attention before submitting
- **Gets smarter over time** — manually correct a field once and Job Buddy remembers it for that site
- **Handles missing data gracefully** — if a field has no profile value, Job Buddy tells you what's missing and opens the right section of your profile to fill it in; return to the tab and it fills automatically
- **Resume upload** — attach your CV to file upload fields automatically, no drag and drop needed
- **Undo in one click** — clear everything Job Buddy filled and start fresh
- **Local-first privacy** — everything stays on your device; zero network requests, no backend, no account required
- **Dark mode** — automatically follows your OS light/dark preference
- **Free and open source** — MIT licensed

---

## Installation

### From the Chrome Web Store

[Install Job Buddy](https://chrome.google.com/webstore/detail/EXTENSION_ID) — available for Chrome and Chromium-based browsers.

### From source

```bash
# Clone the repo
git clone https://github.com/myowinthein/job-buddy.git
cd job-buddy

# Install dependencies
pnpm install

# Build the extension
pnpm build

# Load in Chrome:
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the .output/chrome-mv3 directory
```

---

## How to use

1. Click the Job Buddy icon in your toolbar to open the popup
2. Click **Open Profile** to fill in your details (only needed once)
3. Navigate to any job application page
4. Click **Auto Fill**
5. Review the color-coded highlights and make any corrections
6. Submit your application

**Color codes:**

| Color | Meaning |
|---|---|
| 🟢 Green | Filled with high confidence — looks correct |
| 🟡 Yellow | Filled, but worth a quick review |
| 🔴 Red | Not filled — Job Buddy wasn't confident enough; click to choose a value |
| ⚪ Gray | Not in your profile yet — click to add the missing information |

---

## What you can store in your profile

- Personal info — name, email, phone, date of birth
- Address — street, city, state, postal code, country
- Professional — career summary, notice period
- Work history — multiple roles with company, title, dates, location, description
- Education — multiple entries with institution, degree, field of study, dates
- Salary — current salary and expected salary per country
- Work authorization — status and visa details per country
- Languages — language and proficiency level
- Links — LinkedIn, portfolio, custom links
- Documents — CV/resume file upload or URL

---

## Privacy

Job Buddy stores everything locally in your browser using `chrome.storage.local`.

- No backend server
- No user accounts
- No cloud sync
- No analytics or tracking
- Zero network requests — your data never leaves your device

For full details, see the [Privacy Policy](PRIVACY.md).

---

## Tech stack

- [WXT](https://wxt.dev) — browser extension framework (Vite-based)
- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com)
- [pnpm](https://pnpm.io)
- `chrome.storage.local` for all data persistence

---

## Roadmap

### Phase 1 (current)
- ✅ Profile editor with 9 sections
- ✅ One-click autofill with confidence scoring
- ✅ Color-coded field highlighting
- ✅ Manual field picker with learned mappings
- ✅ Resume/CV file auto-upload
- ✅ Missing data detection with automatic re-fill on profile update
- ✅ Undo autofill
- ✅ Dark mode

### Phase 2 (planned)
- LLM-assisted resume import and field extraction
- Radio button and checkbox autofill
- Custom file upload widget support (Greenhouse, Lever, Workday)
- Analytics opt-in (privacy-friendly)
- Support for more ATS platforms

---

## Contributing

Contributions are welcome. Job Buddy is MIT licensed and built in the open.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Open a pull request with a clear description of what you've changed and why

For bug reports and feature requests, please [open an issue](https://github.com/myowinthein/job-buddy/issues).

---

## Support

Found a bug or have a suggestion? [Open an issue on GitHub](https://github.com/myowinthein/job-buddy/issues).

The issue link is also available from the extension popup and Settings page.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

*Built by [Myo Win Thein](https://github.com/myowinthein)*
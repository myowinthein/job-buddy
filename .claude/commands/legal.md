# legal

Scan the project and generate legal documents based on what the
project actually does. Only generate documents that apply.

---

## Step 1 — Branch check

Only proceed if on main or master.
If on any other branch, stop and inform user:

"legal must be run on main or master.
Current branch is {branch}. Please switch and re-run."

---

## Step 2 — Project scan

Scan the codebase to understand the project's legal profile:

**App type**
- Chrome extension, web app, mobile app, desktop app, open source library
- Infer from manifest.json, package.json, composer.json, folder structure

**Data collection**
- Forms, auth systems, user accounts
- Analytics tools (Google Analytics, Mixpanel, Hotjar, GTM)
- Error tracking (Sentry, Bugsnag)
- Any personally identifiable information (PII) collected or stored

**Third party integrations**
- Payment processors (Stripe, PayPal, Paddle)
- Social auth (Google, GitHub, Facebook OAuth)
- Cloud services (AWS, GCP, Firebase)
- Marketing or tracking tools

**Monetization**
- Payment processing, subscription logic, pricing pages
- Free vs paid tiers

**Content model**
- Does the app let users generate or upload content?
- Does the app provide advice (financial, health, legal, AI-generated)?

**AI features**
- Does the app use AI to generate recommendations presented as facts?
- Does it use a BYOK model (user provides their own API key)?

Record findings before proceeding to document generation.

---

## Step 3 — Determine which documents to generate

Based on scan findings:

Always generate:
- privacy-policy.md
- terms.md

Generate if non-essential cookies or analytics detected:
- cookie-policy.md

Generate if payment processing detected:
- refund-policy.md

Generate if Chrome extension, desktop app, or downloadable software:
- eula.md

Generate if financial, health, legal advice or AI recommendations detected:
- disclaimer.md

Present to user before generating:

"Based on project scan I will generate:
- docs/privacy/index.html   — Privacy Policy (always required)
- docs/terms/index.html     — Terms of Service (always required)
- {conditional documents and why, with full docs/ paths}

Jurisdiction: GDPR
Tone: plain English

Confirm? (yes / no)"

Wait for confirmation before proceeding.

---

## Step 4 — Generate documents

Generate each document in plain English, GDPR compliant.
Write to docs/ as standalone HTML files. Do not generate Markdown.

Each file must match the format of existing docs legal pages:
- Path: docs/{slug}/index.html
  Slug mapping: privacy-policy → privacy, terms → terms,
                eula → eula, disclaimer → disclaimer,
                cookie-policy → cookie-policy, refund-policy → refund-policy
- Standalone <!DOCTYPE html> with no build step or frontmatter
- Inline <style> block using CSS variables:
    --brand:#4B79F7  --navy:#0D1B3E  --text:#1e293b
    --muted:#64748b  --border:#e2e8f0  --bg:#f8fafc
- Sticky topbar: back arrow linking to ../ labelled "Job Buddy",
  separator, breadcrumb with document title
- Inter font via Google Fonts (weights 400;500;600;700)
- Favicon: <link rel="icon" href="../assets/icons/icon.svg">
- <span class="doc-label">Legal</span> badge before <h1>
- <p class="effective-date"> immediately after <h1>
- .related nav at bottom with links to all 4 standard docs
  (privacy, terms, eula, disclaimer); add class="current" to the
  link matching the page being generated
- .site-footer with: ← Back to Job Buddy (../), GitHub link,
  copyright line
- All paths relative: ../ for home, ../assets/icons/icon.svg,
  ../privacy/, ../terms/, ../eula/, ../disclaimer/

**Writing style**
- Use em-dashes sparingly. Only use one when no other punctuation
  (comma, semicolon, colon, or a new sentence) works as well.
  When in doubt, restructure the sentence instead.

**docs/privacy/index.html must cover:**
- What data is collected and why
- How data is stored and protected
- Whether data is shared with third parties (name them)
- User rights under GDPR (access, rectification, erasure, portability)
- Data retention periods
- Contact information for data requests
- Cookie usage (if applicable)
- Last updated date

**docs/terms/index.html must cover:**
- What the service is and what it does
- Acceptable use — what users can and cannot do
- IP ownership — who owns the content and the software
- Liability limitations
- Termination conditions
- Governing law
- Contact information
- Last updated date

**docs/cookie-policy/index.html must cover:**
- What cookies are used and why
- Which are essential vs non-essential
- How users can control cookies
- Third party cookies (name them)

**docs/refund-policy/index.html must cover:**
- Refund eligibility conditions
- Refund request process and timeframe
- Non-refundable items or conditions
- Contact information for refund requests

**docs/eula/index.html must cover:**
- License grant — what users are permitted to do
- Restrictions — what users cannot do
- IP ownership
- Disclaimer of warranties
- Limitation of liability
- Termination conditions

**docs/disclaimer/index.html must cover:**
- Nature of the information provided
- No professional advice claim
- Accuracy limitations
- User responsibility for decisions made
- AI-generated content disclaimer if applicable

---

## Step 5 — Update docs/index.html footer

The landing page footer (docs/index.html) contains links to legal documents.
Check whether it already links to each newly generated document.
If any generated document is not yet linked in the footer, add it.

Privacy Policy and Terms of Service are present by default. Only add links
for documents not already present (e.g. EULA, Disclaimer, Cookie Policy).

Cross-document navigation between legal pages is handled by the .related
nav already included in each generated HTML file — no separate index needed.

---

## Step 6 — Commit

Commit all generated documents:
  docs(legal): regenerate legal pages under docs/

---

## Step 7 — Confirm completion

Report:

LEGAL COMPLETE
Generated:
- {list of documents generated}

Location:     docs/{slug}/index.html for each generated page
Jurisdiction: GDPR
Tone:         plain English
Committed:    yes

Note: These documents are AI-generated starting points.
Review before publishing. Consult a lawyer for high-stakes products.
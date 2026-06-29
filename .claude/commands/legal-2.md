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

Use AskUserQuestion to confirm before generating:
  AskUserQuestion:
    question: "Ready to generate the following legal pages?\n- privacy-policy.md (always required)\n- terms.md (always required)\n- {any conditional documents}\n\nJurisdiction: GDPR · Tone: plain English"
    header:   "Confirm"
    multiSelect: false
    options:
      - label: "Generate (Recommended)"
        description: "Write the legal documents"
      - label: "Cancel"
        description: "Exit without generating anything"

Wait for response before proceeding.

---

## Step 4 — Generate documents

Generate each document in plain English, GDPR compliant.
Write to legal/ folder.

**Writing style**
- Use em-dashes sparingly. Only use one when no other punctuation
  (comma, semicolon, colon, or a new sentence) works as well.
  When in doubt, restructure the sentence instead.

**privacy-policy.md must cover:**
- What data is collected and why
- How data is stored and protected
- Whether data is shared with third parties (name them)
- User rights under GDPR (access, rectification, erasure, portability)
- Data retention periods
- Contact information for data requests
- Cookie usage (if applicable)
- Last updated date

**terms.md must cover:**
- What the service is and what it does
- Acceptable use — what users can and cannot do
- IP ownership — who owns the content and the software
- Liability limitations
- Termination conditions
- Governing law
- Contact information
- Last updated date

**cookie-policy.md must cover:**
- What cookies are used and why
- Which are essential vs non-essential
- How users can control cookies
- Third party cookies (name them)

**refund-policy.md must cover:**
- Refund eligibility conditions
- Refund request process and timeframe
- Non-refundable items or conditions
- Contact information for refund requests

**eula.md must cover:**
- License grant — what users are permitted to do
- Restrictions — what users cannot do
- IP ownership
- Disclaimer of warranties
- Limitation of liability
- Termination conditions

**disclaimer.md must cover:**
- Nature of the information provided
- No professional advice claim
- Accuracy limitations
- User responsibility for decisions made
- AI-generated content disclaimer if applicable

---

## Step 5 — Generate legal/README.md

Create legal/README.md with the following content:
- A title: "Legal Documents"
- A table listing each generated document with columns: Document, Purpose, Last reviewed
- A line stating the jurisdiction: GDPR
- A line advising when to regenerate: "Regenerate with /legal when significant features are added."

Only include rows for documents that were actually generated.
Use current date for Last reviewed column.

---

## Step 6 — Commit

Commit all generated documents:
  docs(legal): generate legal documents for v{version}

---

## Step 7 — Confirm completion

Report:

LEGAL COMPLETE
Generated:
- {list of documents generated}

Location:     legal/
Jurisdiction: GDPR
Tone:         plain English
Committed:    yes

Note: These documents are AI-generated starting points.
Review before publishing. Consult a lawyer for high-stakes products.
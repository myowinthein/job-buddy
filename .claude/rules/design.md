<!-- helm-rule: agent-helm@v3.4.0 -->
# Design Rules

Avoid the generic, interchangeable website patterns commonly called AI slop: familiar visual packages, filler sections and decorative signals repeated without regard to the actual subject. Build responsive, accessible interfaces suited to the project's content and users. This rule supplies practical design constraints, not a complete design method or an authorship test.

## Scope and project conventions

- Apply to requested website/interface creation, edits, planning and critique, including documentation sites. It starts no review during unrelated work.
- Follow applicable instruction precedence, explicit user choices, project branding and established components. During targeted edits, preserve surrounding conventions; loading this rule does not authorize an adjacent redesign or the removal of existing stylistic choices.
- Follow the project's prose guidance for vague claims, hype, repetitive wording and invented facts. Writing can be adopted independently; this rule requires no sibling rule file. Design addresses visual structure, responsive behavior and usability.
- Keep project-specific choices in existing local guidance or design-system sources by default, while respecting explicitly requested customization of this rule. No new brief, settings, files, tools, workflow, score or approval process is needed to apply it. Existing operational boundaries and required checks remain binding.

## Prevent generic AI design patterns

Do not introduce the following patterns automatically to make a page look modern, polished, premium or complete. Use one when the brief, established project style, actual content or interaction gives it a concrete purpose. A technique appearing on this list is not by itself a defect; its repetition without context is the concern. No per-element justification report is required.

| Recurring pattern | What to avoid |
|---|---|
| Prefabricated hero | The same centered oversized headline, small announcement pill, supporting sentence, two buttons and floating mockup regardless of the subject. Do not make every page open this way. |
| Section conveyor belt | Automatically appending features, statistics, testimonials, pricing, FAQs and a final call to action in a fixed sequence. Do not invent content to fill the sequence or transplant it into dashboards, documentation and personal sites. |
| Repeated feature triplets | Turning every explanation into three equal cards, each with an icon tile, short title and similarly sized paragraph. Do not split, pad or truncate real content to fit the arrangement. |
| Containers around everything | Boxing each paragraph, nesting cards inside cards, or forcing unrelated material into a bento grid. Do not add repeated padding, shadows and rounded surfaces without a grouping or interaction purpose. |
| Pill and badge clutter | Packaging ordinary labels, headings and descriptive phrases as chips, capsules or promotional badges. Keep pills that actually represent status, categories or selected filters. |
| Decorative icon furniture | An oversized pastel square, circle, thin-line icon, sparkle or emoji before every feature or heading. Do not assign generic pictograms where they add no information; established navigation and action icons remain useful. |
| Meaningless accent strips | The same thick colored edge on every rounded card or callout, unrelated to status or content. Preserve actual warning, selection and category signals rather than removing their meaning. |
| Template labels and numbering | Repeating tiny uppercase eyebrow text above every heading, monospaced metadata for a technical mood, or `01 / 02 / 03` markers on unordered sections. Do not repeat the heading in a decorative label or imply a sequence that does not exist. |
| Automatic headline effects | Coloring, gradient-filling, underlining or switching one word to serif italic in every headline for emphasis. Do not manufacture emphasis independently of meaning or the project's typographic conventions. |
| Stock typography package | Repeatedly pairing the same default font, such as Inter or Space Grotesk, with the same generic page structure across unrelated projects. A familiar font alone is not a problem; do not swap an established or suitable font merely to evade this example. |
| Ambient decoration package | Default blue/violet washes, blurred light blobs, glowing borders, translucent panels, dotted grids or background noise layered onto every page. Do not add them as automatic signals of sophistication; preserve deliberate brand treatments and useful layering. |
| Motion on every element | Section-by-section entrance effects, cards that all lift on hover, perpetual floating shapes, number counters and typewriter headlines. Avoid animation added merely to make the page feel alive; retain useful interaction feedback and requested expressive motion. |
| Manufactured social proof | Decorative customer-logo rows, ratings, testimonial carousels, user counts, percentage gains and trust seals without actual supporting material. Omit them or visibly label draft placeholders; never present invented evidence as real. |
| Product-looking filler | Fake browser windows, terminals, dashboards and charts that could advertise any product but show none of this one's actual behavior. Do not substitute decorative product theater for relevant evidence. Clearly identified illustrations and requested prototypes may depict simulated states. |
| Replacement clichés | Escaping purple gradients by automatically choosing beige with display serifs and clay accents, dark backgrounds with neon highlights, or a severe newspaper layout. Do not substitute another fashionable package without project context. |

The list is illustrative and maintained, not exhaustive. Check for the same habits in new forms rather than treating unlisted effects as automatically appropriate.

- Use the project's actual subject, content and existing choices to decide which of these defaults to leave out. Missing branding is not permission to apply a stock SaaS theme. Make reasonable reversible choices without a mandatory questionnaire, mood board or design-planning workflow; clarify only material missing facts or requirements.
- Do not preserve an irrelevant section merely because the template supplied it. Recoloring the same layout, changing the font or replacing rounded cards with sharp boxes does not address content that is still interchangeable.
- Do not demand novelty in familiar controls or replace existing design-system components just because they are common. Avoiding slop does not require a custom font, an unusual layout, fewer colors, plainness or a different style on every page.
- A working control, useful callout, meaningful status badge or required disclosure is not disposable decoration. Preserve these when removing a pattern.

## Responsive and accessible interfaces

- Build new interfaces to remain usable across narrow and wide viewports. During targeted edits, preserve existing functionality, content, accessibility and responsive behavior, and address failures introduced by the change.
- Use flexible layouts and media. Choose layout changes based on content and available space, respecting the project's established responsive system. For new layouts without an established system, start with a usable narrow layout and expand as the content benefits. Keep text readable on wide screens as well as narrow ones.
- Preserve access to information and actions as the layout changes. Navigation may collapse and content may move, but essential functionality must remain available. Avoid unintended page overflow; give content that needs a two-dimensional layout, such as data tables or maps, an appropriate accessible presentation rather than clipping it.
- Use [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/) as the default accessibility reference unless applicable project requirements specify otherwise; preserve stronger requirements and report unresolved conflicts with branding. Apply its reflow, text-resizing and orientation requirements with their stated exceptions. Do not disable user zoom to make a layout fit.
- Keep controls usable with keyboard, touch and pointing devices. Do not infer input capabilities solely from viewport width or make essential information available only through hover.

## Links and navigation

For prose references, opening behavior and indicators are decisions within the same reference pass. When Writing is loaded, use its self-contained [Reference links](writing.md#reference-links) sequence; these interface requirements apply within it, without a second selection or review pass. Design remains usable on its own.

Use real links with working destinations for navigation and resource downloads, and buttons for in-page actions. Link directly to the relevant page or existing section ID. Do not present invented URLs or placeholder destinations as working links. Keep each link's purpose clear from its label or associated context.

Open navigation links in the current tab by default. Apply the following behavior unless an explicit project requirement specifies otherwise; do not infer a requirement merely from an existing `target="_blank"`.

| Destination or task | Opening behavior | Indication |
|---|---|---|
| Internal navigation, including same-page anchors, menus, breadcrumbs and pagination | Current tab | No external-link icon. |
| External articles, references, repositories, social profiles and other websites | Current tab | External-link icon on text links. |
| Help/reference material needed alongside an unfinished form, editor or active task | New tab only when replacing the page would lose state or disrupt required work alongside it | New-tab warning; external-link icon only if external. |
| An explicit user-selected action such as "Open preview in new tab" | New tab | The action label states the behavior. |
| Viewable documents, including PDFs | Current tab/browser document handling; file type alone does not justify a new tab | File format; external-link icon if external. |
| Actual downloads | Native download handling; do not force an extra tab | "Download", file format and known size. Use download treatment rather than an external-navigation arrow. |
| Email, telephone and application links | Native protocol handling; do not force a new browser tab | Clear action/destination wording rather than an external-web arrow. |

- Define internal destinations from the configured site/service boundary, including explicit canonical/deployment aliases and any relevant path boundary. An absolute URL can be internal; sharing an organization or parent domain does not make another site/service internal. Parse URLs against that boundary rather than matching a hostname substring. An external destination, long reference, login requirement or desire to retain visitors alone never justifies a new tab.
- Preserve native browser choices: modified clicks, middle-click and context-menu opening. Do not intercept ordinary links to defeat those choices. A requested new browsing context may appear as a tab or window according to browser/user settings; do not promise a particular presentation that the application cannot control.
- For every application-requested new tab/window, warn before activation with visible "opens in new tab" wording (or "opens in new window" for a deliberate window) and equivalent accessible wording. An explicit action label can supply both. A clearly bounded group may share a visible notice if every link retains an accessible warning. Do not rely on a hover tooltip or unexplained icon. User-chosen browser opening needs no added warning. This is Helm's usability policy, not a blanket WCAG AA requirement.
- Use one default external-link symbol: a northeast arrow leaving an open square, rendered through the existing icon set or a matching SVG. Its meaning is "outside this site/service", independent of tab behavior. Apply it consistently to external HTTP(S) text navigation links in body content, lists, tables, navigation and footers. Do not vary the arrow by tab behavior or add it to internal new-tab links. Preserve an explicit established design-system convention instead of silently replacing it; apply that convention consistently without conflating destination and opening behavior.
- Keep the icon inside the same clickable link, after its text. Describe external destinations through meaningful labels/context; the arrow alone does not explain the destination or new-tab behavior. Hide redundant icons from assistive technology and supply equivalent text for information not otherwise conveyed. Logo-only and icon-only links need meaningful accessible names rather than another appended external icon.
- Make links distinguishable from surrounding text, normally by underlining body-text links, and provide visible keyboard focus. Identify known login requirements and application launches in wording. File labels describe the actual format/outcome; do not invent sizes or promise a download when the destination may instead open a viewer. Do not add an interrupting confirmation solely because a link is external.
- For ordinary HTML new-tab links, use `target="_blank"` with `rel="noopener"`. Treat `noreferrer` as a separate project privacy/referrer-policy choice: it also suppresses referrer information. Preserve separately specified authentication/window protocols rather than applying a blanket link rewrite to them.
- Apply tab/icon implementation only where the output medium supports it. Plain Markdown, email and chat renderers may control opening behavior and available markup. Use clear wording without injecting unsupported HTML or promising renderer behavior; this rule requires no renderer customization.

## Review and verification

Make a short silent check of the affected surface: could its sections, icons, mockups and ornamental treatments be reused for an unrelated product with only names changed? Which were added because templates habitually include them? Remove or revise those within the requested scope, while preserving deliberate choices and useful conventions. Do not equate a shared navigation pattern or component library with interchangeable content.

For a requested review, identify the actual issue and its location, explain the effect in that context, and suggest a bounded change. Distinguish ungrounded stylistic defaults from functional, responsive or accessibility failures. Design patterns do not prove who authored a page; do not produce an AI-authorship verdict, probability or slop score.

Use rendering or interaction checks when the change warrants them and authorized tools are available. For layout, navigation or sizing changes, check the affected interface at narrow, intermediate and wide viewports, including transitions around changed breakpoints and relevant portrait/landscape layouts. Include applicable [reflow](https://www.w3.org/TR/WCAG22/#reflow) and [text-resizing](https://www.w3.org/TR/WCAG22/#resize-text) checks: ordinary vertically scrolling content reflows at 320 CSS pixels wide, and text can enlarge to 200% without loss of content or functionality, subject to each criterion's exceptions. These are accessibility checks, not a prescribed set of design breakpoints. For changed links, check destinations and fragment targets, keyboard activation, tab behavior and any indicators.

Source inspection, screenshots and observed behavior provide different evidence; none alone establishes overall accessibility or usability. Required project checks remain required, and unavailable checks stay unverified. Do not install a detector, start a scan or create a report artifact merely because this rule was loaded. Report important limitations, unchecked behavior and unfinished placeholder content through the task's normal handoff.

## References

- **Accessibility and responsive implementation:** [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) supplies the accessibility baseline. Google's [Responsive Web Design Basics](https://web.dev/articles/responsive-web-design-basics) and [Interaction](https://web.dev/learn/design/interaction) guidance inform flexible layouts, content-driven breakpoints and input handling. Keep project-specific grids, breakpoints, tokens and components in the existing design system. Consult detailed guidance when needed; this rule does not require loading whole guides on every task or adopting a framework.
- **Links:** [W3C Link Purpose](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html) explains the accessibility requirement; [G201](https://www.w3.org/WAI/WCAG22/Techniques/general/G201) gives advisory new-window warning techniques. [GOV.UK](https://design-system.service.gov.uk/styles/links/) and [USWDS](https://designsystem.digital.gov/components/link/) inform the usability guidance but differ on external-link icons. Their specific visual conventions are not universal requirements.
- **Pattern examples:** [Anthropic's account of recurring frontend defaults](https://claude.com/resources/articles/improving-frontend-design-through-skills), its [frontend-design guidance](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md), [Impeccable's pattern catalog](https://impeccable.style/slop/) and the [kill-ai-slop project](https://github.com/yetone/kill-ai-slop) inform the pattern list. These are practitioner observations and editorial guidance, not universal usability findings or authorship evidence. They are not instructions to load external skills, run their tools or research every edit.

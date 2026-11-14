<!-- helm-rule: agent-helm@v3.9.0 -->
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

## Theme preferences

When building or changing a theme control, reuse the project's existing preference mechanism and respect explicit project requirements.

- With no valid explicit choice, start from the browser-reported system preference; use the project default or light when that preference is unavailable. Apply the initial theme before paint and keep browser controls' `color-scheme` aligned.
- Store the user's chosen mode, not an automatically detected appearance. A manual Light or Dark choice remains authoritative even when it matches the system; automatic updates never create or overwrite an explicit choice.
- Follow system changes while the page is open only in automatic mode.
- By default, remember explicit choices for that project across tabs, windows and later visits in the same browser profile, until changed or browser data is removed. Synchronize its open views. Use project-specific storage keys where projects share an origin; unrelated projects remain independent. Existing account synchronization or explicit project requirements may define another scope.
- Preserve the control style: a Light/Dark toggle needs no visible System option. Selecting System when available, or clearing the override, restores automatic behavior; do not invent hidden modes or reinterpret a matching manual choice.
- If storage is unavailable, keep the control working in page memory. Invalid or cleared preferences and later visits without usable storage return to the default. Respect private-browsing limits; do not add a backend or promise synchronization across browsers or devices merely to remember a theme.

## Input limits and feedback

Use length limits for actual product, format or resource requirements. Reuse the field's existing constraints; do not invent tighter limits or change accepted data contracts as visual cleanup. If legitimate answers frequently exceed a limit, review that constraint rather than merely adding a counter.

| Situation | Default feedback |
|---|---|
| Ordinary field with a generous technical limit | No counter; explain material or unexpected restrictions. |
| Fixed-format value, such as a six-digit code | Clear format instruction; usually no counter. |
| Composed text where length affects writing, such as a title or short biography | Show the maximum and a live count. |
| Longer text whose limit is rarely approached | Consider a counter near the limit, choosing the threshold for the task rather than imposing a universal percentage. |

- Input width, borders, icons and progress indicators can reinforce expectations, but do not replace necessary instructions or text errors. Do not rely on color alone or put essential instructions only in placeholders. Explain how to correct an exceeded limit; an unexplained disabled submit button is insufficient.
- For composed answers, prefer allowing temporary excess so users can paste the full answer and edit it down before final acceptance. Preserve their text after errors; never silently truncate, discard overflow or block paste. Use a hard stop only where the field's requirements justify it, with clear feedback. Distinguish a user-facing writing limit from a larger resource-safety bound; editing flexibility does not require accepting unbounded input.
- Associate hints, counters and errors with their field. Update visible counts during editing, but keep assistive announcements paced, such as after a pause or a meaningful limit transition. Do not disrupt an active text-composition session with character deletion or premature errors.
- Keep the counter, normalization and final validator consistent about the limit and counting unit. HTML `maxlength` counts UTF-16 units, not necessarily user-perceived characters. Account for emoji, combining characters, whitespace and newlines; prefer user-perceived character counting for writing limits when compatible with the actual data contract. Do not apply destructive normalization merely to fit a limit.
- Browser validation helps users but cannot enforce a backend's trust boundary. Validate accepted values independently on the server where one exists. Local-only apps and extensions validate at their existing save, import and outgoing-data boundaries without adding a backend for this purpose. Native `maxlength` alone does not cover programmatic values or imports. Report enforcement gaps outside an interface-only task rather than claiming frontend checks make them safe.

## Cursors and pointer feedback

Use cursors to describe the available operation at the pointer's location. Prefer system-provided cursors, preserving explicit project or design-system conventions. A hand on enabled custom actions is Helm's usability default, not a universal browser or accessibility requirement.

| Element or operation | Default treatment |
|---|---|
| Ordinary content and decoration | `auto`; preserve normal text selection. |
| Navigation links and enabled custom actions, including buttons, tabs, toggles and disclosures | `pointer` across the actual clickable area. |
| Editable or selectable text, including read-only fields | Native text behavior or `text`; read-only does not mean disabled. |
| Native selects, checkboxes, radios and sliders | Preserve browser or established component behavior. |
| Disabled custom actions | `not-allowed`, or the established design system's default arrow; no enabled-action hand or hover treatment. |
| Drag handle / engaged drag | `grab` / `grabbing`, only where dragging actually works. |
| Resize or zoom operation | Matching directional resize cursor or `zoom-in` / `zoom-out`, only when available. |
| Processing | `progress` where interaction remains available; reserve `wait` for a genuinely blocked interaction and scope it to the affected area. |

- Ordinary hover and pressing keep the operation's cursor. Show pressed feedback on the control; change cursors only when the operation or availability changes. Restore the appropriate cursor after completion, cancellation or failure. Copy buttons use the action cursor; `copy`, `move` and `no-drop` describe actual transfer operations, not button labels. Use `help` only for an available help interaction.
- Scope cursor styling to the actual control or handle. Do not apply a hand to an entire card, row or label unless that area activates its action. Avoid wildcard cursor overrides that mask text selection, native controls or specialized operations. A validation error does not make an editable field disabled.
- Use native links and buttons with correct behavior. Cursor styling, `aria-disabled` and `pointer-events: none` alone do not disable all activation paths. Preserve selectable read-only content and prevent unavailable actions through their actual semantics and handlers.
- Cursors supplement recognizable controls, visible keyboard focus and touch operation. Prefer native click activation over executing ordinary actions on pointer-down, so users can cancel before releasing. Dragging needs keyboard access and a single-pointer alternative without dragging unless a relevant exception applies.
- Avoid decorative cursor replacements or trails by default. Preserve deliberate existing cursor designs when they keep operation cues, readable selection and native controls usable; respect reduced-motion preferences and platform limitations. Do not require identical cursor artwork across browsers or operating systems.

## Links and navigation

For prose references, opening behavior and indicators are decisions within the same reference pass. When Writing is loaded, use its self-contained [Reference links](writing.md#reference-links) sequence; these interface requirements apply within it, without a second selection or review pass. Design remains usable on its own.

Use real links with working destinations for navigation and resource downloads, and buttons for in-page actions. Link directly to the relevant page or existing section ID. Do not present invented URLs or placeholder destinations as working links. Keep each link's purpose clear from its label or associated context.

Open navigation links in the current tab by default. Apply the following behavior unless an explicit project requirement specifies otherwise; do not infer a requirement merely from an existing `target="_blank"`.

| Destination or task | Opening behavior | Indication |
|---|---|---|
| Internal navigation, including same-page anchors, menus, breadcrumbs and pagination | Current tab | No external-link icon. |
| External articles, references, repositories, social profiles and other websites | Current tab | External-link icon on text links. |
| Help/reference material needed alongside an unfinished form, editor or active task | New tab only when replacing the page would lose state or disrupt required work alongside it | External-link icon only if external; no opening notice. |
| An explicit user-selected opening action | User-selected tab/window behavior | Use the action's normal label without an added opening notice. |
| Viewable documents, including PDFs | Current tab/browser document handling; file type alone does not justify a new tab | File format; external-link icon if external. |
| Actual downloads | Native download handling; do not force an extra tab | "Download", file format and known size. Use download treatment rather than an external-navigation arrow. |
| Email, telephone and application links | Native protocol handling; do not force a new browser tab | Clear action/destination wording rather than an external-web arrow. |

- Define internal destinations from the configured site/service boundary, including explicit canonical/deployment aliases and any relevant path boundary. An absolute URL can be internal; sharing an organization or parent domain does not make another site/service internal. Parse URLs against that boundary rather than matching a hostname substring. An external destination, long reference, login requirement or desire to retain visitors alone never justifies a new tab.
- Preserve native browser choices: modified clicks, middle-click and context-menu opening. Do not intercept ordinary links to defeat those choices. A requested new browsing context may appear as a tab or window according to browser/user settings; do not promise a particular presentation that the application cannot control.
- Do not add notices solely to announce a new tab/window, whether visible or hidden: no label suffixes, tooltips, accessible-only text, live announcements, dialogs or group notices. Keep link labels and accessible names meaningful for their destinations. The external-link icon remains a destination indicator, not an opening announcement.
- Use one default external-link symbol: a northeast arrow leaving an open square, rendered through the existing icon set or a matching SVG. Its meaning is "outside this site/service", independent of tab behavior. Apply it consistently to external HTTP(S) text navigation links in body content, lists, tables, navigation and footers. Do not vary the arrow by tab behavior or add it to internal new-tab links. Preserve an explicit established design-system convention instead of silently replacing it; apply that convention consistently without conflating destination and opening behavior.
- Keep the icon inside the same clickable link, after its text. Describe external destinations through meaningful labels/context; the arrow alone does not explain the link's purpose. Hide redundant icons from assistive technology and supply equivalent text for information not otherwise conveyed. Logo-only and icon-only links need meaningful accessible names rather than another appended external icon.
- Identify known login requirements and application launches in wording. File labels describe the actual format/outcome; do not invent sizes or promise a download when the destination may instead open a viewer. Do not add an interrupting confirmation solely because a link is external.
- For ordinary HTML new-tab links, use `target="_blank"` with `rel="noopener"`. Treat `noreferrer` as a separate project privacy/referrer-policy choice: it also suppresses referrer information. Preserve separately specified authentication/window protocols rather than applying a blanket link rewrite to them.
- Apply tab/icon implementation only where the output medium supports it. Plain Markdown, email and chat renderers may control opening behavior and available markup. Use clear wording without injecting unsupported HTML or promising renderer behavior; this rule requires no renderer customization.

### Link appearance and interaction

Make links recognizable before interaction, using the project's existing palette and components. Apply these defaults within the same reference pass; appearance does not change the opening or external-indicator rules above.

| Context | At rest | On hover |
|---|---|---|
| Prose, reference lists and table text | Underlined, with readable link text. | Keep the underline; strengthen its thickness, color or another established cue. |
| Standalone text link | Underlined by default; an established clearly recognizable component may use another cue. | Strengthen the existing cue or add an underline. |
| Header, sidebar, breadcrumb and footer navigation | Underline optional when grouping and placement clearly identify navigation. | Use the component's underline, background or color feedback consistently. |
| Button-styled link | Existing button appearance. | Existing button hover treatment. |
| Linked card | Recognizable linked title or navigation affordance. | Emphasize the title, border or background; preserve suitable existing motion. |
| Icon or logo link | Recognizable placement and a meaningful accessible name; no underline needed. | Suitable feedback for the component. |

- Do not rely on hue alone to distinguish links from surrounding prose. Keep underlines clearly visible against the actual background at rest, choosing colors and thickness suited to the project; hover and keyboard focus may strengthen them. Underlining is Helm's baseline, not a WCAG requirement for every link. If an explicit project convention omits it, verify another persistent distinction; a contrast ratio of at least 3:1 against surrounding text is one W3C technique. Hover-only styling cannot establish discoverability on touch devices. Reserve underlines for links rather than ordinary non-link emphasis.
- Link text must meet WCAG AA text contrast against its actual background in rest, hover and any visited styling: at least 4.5:1 for ordinary text, or 3:1 for qualifying large text. The surrounding-text comparison is separate. Muted colors may support secondary navigation when readable and recognizable; do not make usable links resemble disabled text. Underlined links may use readable body colors; blue is not required.
- Provide a clearly visible keyboard focus indicator independently of hover, reusing the established focus treatment and meaningful hover emphasis where appropriate. Keep essential labels and destination indicators available without hover. Avoid hover font-size or font-weight changes that shift layout. Preserve purposeful motion and respect reduced-motion preferences.
- Use visited styling when knowing previous visits helps the task, such as reference reading; it is optional for menus, buttons and other components where history adds little. Keep visited links recognizable and readable. Current-page indication represents location, not browsing history.

## Review and verification

Make a short silent check of the affected surface: could its sections, icons, mockups and ornamental treatments be reused for an unrelated product with only names changed? Which were added because templates habitually include them? Remove or revise those within the requested scope, while preserving deliberate choices and useful conventions. Do not equate a shared navigation pattern or component library with interchangeable content.

For a requested review, identify the actual issue and its location, explain the effect in that context, and suggest a bounded change. Distinguish ungrounded stylistic defaults from functional, responsive or accessibility failures. Design patterns do not prove who authored a page; do not produce an AI-authorship verdict, probability or slop score.

Use rendering or interaction checks when the change warrants them and authorized tools are available. For layout, navigation or sizing changes, check the affected interface at narrow, intermediate and wide viewports, including transitions around changed breakpoints and relevant portrait/landscape layouts. Include applicable [reflow](https://www.w3.org/TR/WCAG22/#reflow) and [text-resizing](https://www.w3.org/TR/WCAG22/#resize-text) checks: ordinary vertically scrolling content reflows at 320 CSS pixels wide, and text can enlarge to 200% without loss of content or functionality, subject to each criterion's exceptions. These are accessibility checks, not a prescribed set of design breakpoints. For changed links, check destinations and fragment targets, keyboard activation, tab behavior and any indicators.

For changed link styling, check rest, hover, keyboard focus and any visited state against the actual backgrounds in supported themes. Check touch use without hover and confirm that emphasis does not shift the layout. For theme changes, check initial appearance, manual overrides, live system changes in automatic mode, same-project tab updates and unavailable storage.

For changed cursor behavior, check the actual hit area, hover, press, disabled/read-only and any processing or drag states. Verify recovery after completion or cancellation, selection, keyboard operation and touch use without relying on a cursor.

For input-limit changes, check boundary values, paste, autofill or imported values, relevant languages and composed text, counter/validator agreement, accessible feedback and recovery without losing the answer. Distinguish browser checks from verification of the receiving validation boundary.

Source inspection, screenshots and observed behavior provide different evidence; none alone establishes overall accessibility or usability. Required project checks remain required, and unavailable checks stay unverified. Do not install a detector, start a scan or create a report artifact merely because this rule was loaded. Report important limitations, unchecked behavior and unfinished placeholder content through the task's normal handoff.

## References

- **Input limits:** [GOV.UK character counts](https://design-system.service.gov.uk/components/character-count/) and [USWDS guidance](https://designsystem.digital.gov/components/character-count/) support selective counters. [GOV.UK text-input guidance](https://design-system.service.gov.uk/components/text-input/#avoid-restricting-the-length-of-a-users-input) explains truncation risks. W3C's [error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) and [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) inform accessible feedback; [HTML length constraints](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#limiting-user-input-length:-the-maxlength-attribute), [Unicode segmentation](https://www.unicode.org/reports/tr29/) and [OWASP validation guidance](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html) inform counting and enforcement. A counter is not required on every limited field.
- **Cursors:** [W3C cursor definitions](https://www.w3.org/TR/css-ui-3/#cursor) describe operation cues; [Apple's pointing-device guidance](https://developer.apple.com/design/human-interface-guidelines/pointing-devices) favors familiar, useful effects. [Tailwind's native button default](https://tailwindcss.com/docs/upgrade-guide#buttons-use-the-default-cursor) and [GOV.UK's menu-button convention](https://design-system.service.gov.uk/components/header/history/) illustrate different valid choices. W3C's [pointer cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html) and [dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) inform interaction requirements; no cursor shape alone establishes accessibility.
- **Theme preferences:** Google's [theme-switch component guidance](https://web.dev/articles/building/a-theme-switch-component) informs system defaults, saved choices and initial rendering. MDN documents [local storage's scope and lifetime](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) and [cross-tab storage events](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event). Helm's default persistence scope and optional System control are project policy, not universal accessibility requirements.
- **Accessibility and responsive implementation:** [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) supplies the accessibility baseline. Google's [Responsive Web Design Basics](https://web.dev/articles/responsive-web-design-basics) and [Interaction](https://web.dev/learn/design/interaction) guidance inform flexible layouts, content-driven breakpoints and input handling. Keep project-specific grids, breakpoints, tokens and components in the existing design system. Consult detailed guidance when needed; this rule does not require loading whole guides on every task or adopting a framework.
- **Links:** [W3C Link Purpose](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html) explains the accessibility requirement; [G200](https://www.w3.org/WAI/WCAG22/Techniques/general/G200) discusses limiting new browsing contexts. [GOV.UK](https://design-system.service.gov.uk/styles/links/) and [USWDS](https://designsystem.digital.gov/components/link/) inform the usability guidance but differ on external-link icons; USWDS research also found inconsistent understanding of icons. Helm's default symbol is local policy, not a universal accessibility requirement. The [HTML standard](https://html.spec.whatwg.org/multipage/links.html#link-type-noopener) defines opener protection and referrer suppression.
- **Link appearance:** [Fluent](https://fluent2.microsoft.design/components/web/react/core/link/usage) and [Carbon](https://www.carbondesignsystem.com/building-blocks/core/components/link/guidelines) distinguish inline links from standalone or navigation components. W3C's [G183 technique](https://www.w3.org/WAI/WCAG22/Techniques/general/G183), [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [visible focus](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) guidance inform the accessibility checks. Helm's default underlines and contextual hover treatments are usability choices; these sources do not mandate one appearance for every link.
- **Pattern examples:** [Anthropic's account of recurring frontend defaults](https://claude.com/resources/articles/improving-frontend-design-through-skills), its [frontend-design guidance](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md), [Impeccable's pattern catalog](https://impeccable.style/slop/) and the [kill-ai-slop project](https://github.com/yetone/kill-ai-slop) inform the pattern list. These are practitioner observations and editorial guidance, not universal usability findings or authorship evidence. They are not instructions to load external skills, run their tools or research every edit.

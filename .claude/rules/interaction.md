<!-- helm-rule: agent-helm@v3.10.0 -->
# Interaction Rules

Keep preferences, input feedback, cursors and link behavior predictable during requested interface work, including documentation sites. Preserve explicit user choices, project conventions, existing controls and the output medium's capabilities. Apply only relevant sections; loading this rule starts no redesign, scan, installation, workflow or extra execution authority.

Writing owns prose and editorial references; Design owns visual composition, responsive layout, theme appearance and visual accessibility. Neither is a dependency. Use their relevant guidance when separately selected, within the same task. Apply this rule's written guidance; linked standards are maintenance sources, not instructions to browse or check updates. Helm's hand cursor, external icon, underline and persistence defaults are preferences, not universal accessibility requirements.

## Feedback and loading

Keep feedback behavior consistent for comparable operations across buttons, links and other controls: when pending, completion and failure states appear, change and clear. Make these states clear without requiring hover for essential feedback. Confirm success only after the operation succeeds. Connect errors to the affected task and useful recovery. Follow project presentation conventions, allowing different treatments where the context warrants them.

Keep loading and error popups readable within the visible viewport as people scroll, resize, zoom or adjust text size and spacing. Reposition or reflow them without moving surrounding content or obscuring the focused control.

Avoid flashing loading labels, spinners or busy cursors for near-instant actions. Any delay applies to pending visuals, not the operation, required accessibility state or duplicate-activation protection. Keep unrelated controls usable, communicate temporary unavailability, and clear stale loading feedback and restore appropriate controls when work ends. Choose visual timing for the task rather than imposing a universal delay.

Respect reduced-motion preferences across affected controls, feedback and transitions, preserving purposeful motion where compatible.

### Keyboard focus and autofocus

Keep keyboard focus visible on the actual focused control independently of hover, for as long as it remains focused; feedback dismissal timers never apply to focus indicators. Reuse the project's focus treatment across comparable controls, with appropriate contrast in supported themes and forced-colors mode; spacing fixes preserve its established visual style. A replacement for the native indicator must remain clearly visible; a shadow alone can disappear in forced colors.

Keep custom indicators complete and unclipped at control, scroll-container and viewport edges. For inline text links, preserve natural word spacing and paragraph line height. Use only the clearance needed around text and icons to keep the indicator visibly separate from the underline, including when links wrap or text is enlarged.

For bordered controls, default to placing the focus indicator over the existing border when it remains clearly distinguishable. If matching or similar colors make it blend in, leave a small gap. Keep the component's size and layout unchanged. Exact colors, shape, thickness, offsets and padding remain project choices, subject to accessibility requirements.

[Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) adds AAA criteria, not an automatic AA requirement.

Use `:focus-visible` where supported to avoid forcing keyboard-style outlines on ordinary pointer activation, retaining a visible fallback where needed. Preserve native focus behavior, including text editing; do not blur controls merely to hide an indicator. Author-created sticky headers, banners and overlays must not entirely hide a focused component under [WCAG's Focus Not Obscured minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), retaining its stated conditions.

Match Tab order and stops to meaningful actions. Where several controls share a row highlight, make the focused action understandable and avoid indistinguishable repeated stops. Combine stops only while preserving native semantics and keyboard access to every action; a shared highlight alone does not justify removing a control from keyboard access.

Autofocus means moving focus automatically, not styling Tab-key navigation. Use it only for a clear task purpose; avoid unexpected scrolling, opening a mobile keyboard or skipping necessary context. Do not steal focus on routine renders or updates, or move it merely to display a visual effect.

For true tab widgets, follow the [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), distinguishing focus from selection. Automatic activation on focus requires panels that appear without noticeable latency; otherwise use manual activation with Enter or Space. Navigation links styled as tabs remain links, not an automatic widget conversion.

### Errors and retries

Keep errors and recovery available until retried, resolved or deliberately dismissed. A recoverable error popup can default to 4 seconds when the failure and recovery remain discoverable without it, such as a labeled retry control or visible text that can be copied manually; otherwise keep the message available. Respect explicit project timing and accessibility requirements.

Preserve entered text. Typing must not repeatedly retry an unchanged failed prerequisite; use deliberate retry for that failure while allowing new work when relevant inputs change. Clear obsolete loading/error timers when attempts change or finish so they cannot overwrite newer feedback.

### Copy feedback

Default to 2 seconds of success feedback from the confirmed clipboard write, preserving explicit project timing or accessibility requirements. Across copy controls in the same interface, keep only the latest successful confirmation: clear earlier success messages, icons and timers when the new write succeeds. Pending or failed writes must not clear another control's success feedback.

Keep only the latest copy error, clearing earlier error messages and their timers when a new copy attempt starts. Explain retry or manual copying in one concise sentence; the recoverable-error default applies only when manual copying remains available.

## Preferences and persistence

Reuse the project's controls, storage mechanism, defaults and intended setting scope. Persist choices meant for reuse, such as quality or theme; do not automatically persist transient inputs or per-item selections.

- Match storage to lifetime: page-only state can stay in memory, tab-session state can use `sessionStorage`, and small non-sensitive preferences across visits can use `localStorage`. Use established cookie/account mechanisms when the server or account needs the setting; add no backend or cross-device synchronization merely to remember a choice.
- Save deliberate preference changes, not calculated defaults on page load. Validate stored values; missing, cleared or invalid values use the setting's documented default without automatically saving that fallback. Restore valid choices before presenting a misleading selection, preserving server/client rendering consistency where applicable.
- Persistent local preferences belong to the site's origin and browser profile, not the browser globally. Use keys scoped to the project and setting, especially for projects sharing an origin. They last until changed or site data is removed, subject to browser/private-mode limits; existing account synchronization or explicit requirements may define another scope.
- Synchronize shared preferences across the appropriate open views without write-back loops or unrelated input resets. Keep per-view/per-item choices separate. Do not silently change an active operation's starting configuration when that would alter its result; apply the new preference to subsequent work unless the product explicitly supports live changes.
- Handle unavailable storage and read/write failures with usable in-memory controls. A failed save must not undo the current choice; later visits without usable storage return to the documented default. Respect intentional reset/clear behavior and make no cross-browser/device persistence promise.
- If applying a deliberate new preference fails, keep the previous working value and restore the control to it. Do not persist the failed attempt as an applied choice. Keep the control, effective value and saved successful preference consistent; storage failure after successful application retains the working in-memory choice as above.

### Theme preferences

- With no valid manual override, follow the browser-reported system preference; if unavailable, use the project default or light. Apply the initial theme before paint and align browser controls' `color-scheme`.
- Manual Light/Dark wins even when it matches the system. Follow live system changes only in automatic mode, without creating or overwriting a manual choice. If an automatic appearance change fails, retain the working appearance and automatic preference, report the failure and continue following later system changes. A temporary fallback must not become a manual override.
- Give the theme control a clear accessible name and expose its selected mode through semantics matching the control. An actual [binary switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/) keeps a stable label and exposes its on/off state; System/Light/Dark requires suitable three-choice semantics, not a third switch state.
- Preserve the toggle or selector style; a visible System option is optional. Selecting System when available, or clearing the override, restores automatic behavior. Do not invent hidden modes or reinterpret a matching manual choice. Other settings use their own defaults; theme-following behavior supplies no automatic quality or device-based mode.

## Input limits and feedback

Keep existing accepted-data contracts. Limits need a product, format or resource reason; do not tighten them as visual cleanup. Reassess a frequently exceeded limit rather than automatically adding a counter.

| Situation | Default feedback |
|---|---|
| Ordinary field with a generous technical limit | No counter; explain material or unexpected restrictions. |
| Fixed-format value, such as a six-digit code | Clear format instruction; usually no counter. |
| Composed text whose length matters, such as a title or biography | Show the maximum and a live count. |
| Longer text rarely approaching its limit | Consider a near-limit counter with a task-appropriate threshold. |

- Explain restrictions and how to correct errors; color, width, borders, icons, placeholders or an unexplained disabled submit button cannot replace needed text. Associate hints, counters and errors with the field. Visible counts may update while typing; pace assistive announcements and do not interrupt text composition.
- Preserve the answer after errors. For composed text, normally allow temporary excess and full paste so people can edit down; do not silently truncate, discard overflow or block paste. A justified hard stop needs clear feedback. Editing flexibility does not remove a larger resource-safety bound.
- Keep counters, normalization and final validation consistent about limits and counting units, including emoji, combining characters, whitespace and newlines. HTML `maxlength` counts UTF-16 units; prefer user-perceived characters for writing limits when the data contract permits. Never strip meaningful text merely to fit.
- Browser feedback does not enforce a receiving service's trust boundary. Validate independently there; local-only apps use existing save, import and outgoing-data boundaries without adding a backend. Include programmatic and imported values, which native `maxlength` alone does not cover. Report outside-scope enforcement gaps rather than expanding an interface task or claiming frontend checks secure the whole path.

## Cursors and pointer feedback

Match the cue to the available operation, using system cursors and established project conventions.

Pointer targets meet [WCAG 2.2's 24 by 24 CSS-pixel minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) or its spacing and other exceptions, including inline text links. Measure the actual activation area, which can extend beyond a smaller visible icon, and preserve stronger project requirements.

| Element or operation | Default treatment |
|---|---|
| Ordinary content and decoration | `auto`; preserve text selection. |
| Links and enabled custom buttons, tabs, toggles or disclosures | `pointer` over the actual clickable area. |
| Editable or selectable text, including read-only fields | Native behavior or `text`; read-only is not disabled. |
| Native selects, checkboxes, radios and sliders | Preserve browser or component behavior. |
| Disabled custom action | `not-allowed` or the design system's arrow; no enabled-action hand or hover cue. |
| Working drag handle / engaged drag | `grab` / `grabbing`. |
| Available resize or zoom operation | Matching directional resize or `zoom-in` / `zoom-out`. |
| Sustained processing | `progress` while interaction remains available; `wait` only over the blocked area. |

Ordinary hover and press keep the operation's cursor; pressing needs visible feedback. Change cues when the operation or availability changes and restore them after completion, cancellation or failure. The `copy`, `move` and `no-drop` cursors describe transfer operations, not ordinary button activation. Use `help` only for an available help interaction.

Scope styling to the actual control or handle, not an unrelated card, row or label. Avoid wildcard overrides hiding text selection, native controls or specialized cues; validation errors do not disable editable fields. Cursor styling, `aria-disabled` or `pointer-events: none` alone cannot prevent every activation path: implement correct native semantics and handlers and preserve selectable read-only content.

Keep recognizable controls, keyboard and touch use independently of cursors. Prefer native click activation so users can cancel before release. Dragging needs keyboard access and a non-drag single-pointer alternative unless an applicable exception applies. Avoid decorative cursor replacements or trails by default; preserve deliberate designs that retain operation cues and native usability. Respect platform differences, without demanding identical cursor artwork.

## Links and navigation

Use real links for navigation and downloads and buttons for in-page actions. Check relevant destinations, fragments and meaningful labels from available evidence; live external verification needs an explicit scope. Do not present invented URLs or placeholders as working links. When Writing is selected, apply these behaviors within its editorial reference pass without repeating selection.

Current tab is the default. Existing `target="_blank"` alone establishes no requirement for a new context.

| Destination or task | Opening behavior | Indication |
|---|---|---|
| Internal page, section, menu, breadcrumb or pagination | Current tab. | No external icon. |
| External website, reference, repository or social text link | Current tab. | External icon. |
| Reference needed alongside an active form, editor or task | New context only to preserve state or required work alongside it. | External icon only if external. |
| Explicit user-selected opening or project requirement | Requested behavior within renderer and browser limits. | Ordinary meaningful label; no opening notice. |
| Viewable document, including PDF | Current tab or browser handling; file type alone warrants no new tab. | Actual format; external icon if external. |
| Actual download | Native handling, no forced extra tab. | Download wording, format and known size; no external-navigation arrow. |
| Email, telephone or app link | Native protocol handling, no forced extra tab. | Clear action/destination. |

- Classify against the actual site or service boundary, configured aliases and relevant paths. Absolute URLs can be internal; sharing an organization or parent domain does not establish this. Parse boundaries instead of matching hostname substrings. Externality, long references, login or visitor retention alone warrant no new tab.
- Preserve modified clicks, middle-click and context menus. Do not promise a tab or window presentation controlled by the browser. Apply supported behavior without unsupported HTML or renderer customization.
- Add no visible or hidden opening announcement: no label suffix, tooltip, accessible-only text, live announcement, dialog or group notice solely for opening a new tab or window. Keep labels and accessible names meaningful. External links need no interrupting confirmation.
- Use one external HTTP(S) text-navigation symbol: a northeast arrow leaving an open square, from the existing icon set or matching SVG. Apply consistently across content, lists, tables, navigation and footers. It identifies the destination, independently of opening behavior; internal new-tab links get none. Preserve explicit design-system alternatives consistently.
- Place the icon after text inside the same link. Hide redundant icons from assistive technology; convey otherwise missing information in text. An arrow alone explains no purpose; logo-only or icon-only links need meaningful accessible names rather than appended arrows. Identify known login requirements, app launches and actual file outcomes without inventing sizes or promising downloads that may be viewers.
- Ordinary HTML new-tab links use `target="_blank"` with `rel="noopener"`; `noreferrer` separately changes referrer disclosure. Preserve specified authentication and window protocols rather than blanket-rewriting them.

### Link appearance and interaction

Make links recognizable before interaction, using the existing palette and components. Appearance does not change opening or indicator policy.

| Context | At rest | On hover |
|---|---|---|
| Prose, reference lists and table text | Visible underline and readable text. | Retain underline; strengthen thickness, color or another established cue. |
| Standalone text link | Underlined unless an established recognizable component supplies another cue. | Strengthen that cue or add underline. |
| Header, sidebar, breadcrumb or footer navigation | Underline optional when grouping and placement clearly identify navigation. | Consistent component feedback. |
| Button-styled link | Existing button treatment. | Existing button hover. |
| Linked card | Recognizable linked title or navigation affordance. | Emphasize title, border or background; retain purposeful motion. |
| Icon or logo link | Recognizable placement and accessible name; no underline needed. | Suitable component feedback. |

- Do not rely on hue or hover alone. Keep underlines visible at rest; reserve them for links rather than ordinary emphasis. If an explicit convention omits them, verify a persistent distinction; 3:1 contrast against surrounding text is one W3C technique, separate from background contrast.
- Keep underlines continuous beneath the full link text on each rendered line, including letters with descenders such as `g`, `p` and `y`. Leave enough space below letters and avoid clipping at line or container edges. In HTML/CSS, use `text-decoration-skip-ink: none` with a suitable `text-underline-offset`.
- Text contrast against its background in rest, hover and visited states meets WCAG AA: 4.5:1 for ordinary text or 3:1 for qualifying large text. Muted links must remain readable and usable-looking; blue is not required.
- Essential labels and indicators remain available on touch. Avoid emphasis that shifts layout.
- Use visited styling when reading history helps; it is optional for menus or buttons where it adds little. Keep it readable and distinct from the current-page marker, which indicates location.

## Review and verification

Use available authorized tools on affected controls and states, preserving required project checks, palette, layout and accessibility. Check keyboard, touch and pointer use without relying solely on hover or cursors, and verify recovery after completion, cancellation or failure. For affected mobile forms, check that fields and actions remain reachable when the [on-screen keyboard changes the visible viewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport); no particular viewport API is required.

| Changed area | Relevant checks |
|---|---|
| Feedback | Quick/slow actions, confirmed outcomes, deliberate retries and preserved input, readable popups after viewport/text changes, recovery after timed errors, stale timers and copy-confirmation replacement. |
| Focus and autofocus | Tab/Shift+Tab order and meaningful stops, persistent indication, rendered focus appearance across affected components, page layouts, viewport widths and themes/forced colors, no layout shift, deliberate initial focus and applicable tab-widget behavior. |
| Preferences | Valid/default/invalid/cleared values, reload/later visits, project/setting isolation, open-view updates, storage failures and unaffected active operations. |
| Themes | Named control and selected-mode semantics, initial paint, manual overrides, automatic system changes and recovery after failed appearance changes, using the shared persistence checks above. |
| Input limits | Boundaries, paste, autofill, imports, relevant languages and text composition, counting agreement, accessible feedback and preserved answers. Distinguish browser checks from receiving validation. |
| Cursors | Actual hit area, pointer target size/spacing, hover, press, disabled/read-only, processing and drag states, and selection. |
| Links | Destinations, fragments, opening behavior, indicators, continuous unclipped underlines with clearance below letters (including wrapped links and enlarged text), contrast at rest/focus/hover/visited states in supported themes, and stable layout. |

Source inspection, screenshots and observed behavior provide different evidence; none alone proves overall accessibility or usability. Computed styles and automated test results do not replace visual inspection. Report which pages, components and states were checked, distinguishing representative samples from complete requested coverage, along with unavailable checks, important limitations and unfinished placeholders in the normal handoff. This rule requires no detector, tool installation, report artifact or added approval process.

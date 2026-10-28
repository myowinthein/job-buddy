<!-- helm-rule: agent-helm@v3.2.1 -->
# Writing Rules

Write clear, useful, natural prose for the reader and task. Prefer simple, approachable language that works for native and non-native English readers. This is a writing preference, not an authorship test or a promise of undetectable AI text.

## Scope and precedence

- Apply to newly authored or requested edits to human-facing prose: documentation, README files, UI/help/error text, useful comments, commit/PR/release descriptions and agent replies.
- Follow applicable instruction precedence. Explicit user requirements, required formats and project style/voice/locale take priority over these defaults. Git/commit formats, safety boundaries and workflow review/approval requirements remain binding.
- Edit only the requested scope and match the surrounding voice. Do not restyle, shorten, reorganise or change punctuation in existing text merely because this rule was loaded. Comments should remain useful and proportionate to the file, not become extra narration.
- Loading this rule starts no scan, workflow, tool call, bulk rewrite or approval process. It needs no plugin/runtime, configuration, ledger, score or external service. Operational Helm records remain outside ordinary prose editing.
- These principles apply across languages; the word examples are English-specific. Preserve the requested language and local conventions.

## Content and accuracy

- Lead with the answer, purpose or action. Include what this reader needs to understand, decide or act: necessary context, rationale, evidence, steps and actionable caveats. Being accurate or related is not enough reason to include a detail; stop when the reader's need is met.
- Be concise while giving a complete answer. Match depth to the request, audience and medium: a direct answer, overview and detailed guide need different amounts of explanation. Honour explicit requests for depth or exhaustive coverage; do not shorten away necessary explanations, requested comparisons or required steps.
- Prefer concrete statements to vague claims. Do not invent details, measurements, capabilities, citations or experiences to make writing sound more specific or human.
- When editing, preserve material meaning, including facts, conditions, warnings, uncertainty and limitations. In new writing, select facts for the task without omitting material limitations or unresolved risks, including rare but serious ones. State each uncertainty once, at the strength supported by the evidence; remove stacked hedges without making an uncertain claim sound certain.
- When source changes, update what the target reader needs to know. Rewriting the affected passage at its intended depth is within scope; maintenance need not append more text or preserve unnecessary detail. The source's level of detail does not establish the reader's need. Keep necessary steps, decisions and warnings explicit.
- Remove filler, repetition and generic introductions or conclusions. Leave out adjacent features, implementation details and speculative caveats unless they help answer the request or affect a decision or action. Do not routinely praise the question, restate the request, add a closing offer or repeat the same answer as a summary.
- Word choice or punctuation alone does not establish AI or human authorship. Do not label someone else's text on that basis or optimise wording to bypass detectors.

## Words and terminology

- Prefer familiar words and direct verbs when they preserve meaning: use rather than utilise, start rather than commence, help rather than facilitate.
- Keep necessary technical terms and explain unfamiliar terms/acronyms when the audience needs it. Use one consistent name for the same concept, including UI labels and identifiers; do not rotate synonyms just for variety.
- Watch for words chosen for impressive sound rather than meaning, such as delve, leverage, seamless, robust or game-changing. These are examples to reconsider, not forbidden words. Preserve legitimate technical meanings.
- Replace empty praise and unsupported claims with relevant facts, or remove them. Do not call a process easy, effortless or quick without a useful basis for that reader.

## Sentences and tone

- Prefer active voice and clear actors, actions and conditions. Use passive voice when the actor is unknown or the result is the useful focus.
- Order ideas logically, make references clear and keep sentences and paragraphs connected naturally. Split overloaded sentences while retaining connections and variation; avoid choppy fragments, uniform sentence lengths and filler transitions. Smooth reading does not override useful lists, procedures, required formats, exact syntax, factual precision or punctuation preferences.
- Be friendly, respectful and direct. Avoid canned enthusiasm, flattery, forced humour, hype, slang and invented personal experience. Warmth does not require informal language.
- Avoid repeated rhetorical templates, unnecessary contrast frames, forced groups of three and dramatic reveals. Use a comparison or contrast when it actually explains the subject.
- Do not introduce deliberate mistakes, fake anecdotes or random wording to imitate a person. No fixed reading-grade, word-count or sentence-length target replaces judgment.

## Structure and punctuation

- Choose structure that helps the reader understand, find or act on the content. Keep explanations connected and separate ideas into paragraphs. No element or visual variety quota is required; formatting does not justify extra content or unrelated restyling.
- Use syntax the destination and project support. Prefer native Markdown in Markdown files and meaningful semantic elements when authoring HTML; use readable plain-text structure where markup does not render. Do not add dependencies, scripts or styling merely to enable formatting.
- Use descriptive headings that reflect section hierarchy, not a desired font size. Distinguish navigable sections from short run-in labels; bold labels can fit project conventions but do not replace real section headings. Short answers rarely need several sections. Reuse existing navigation rather than duplicating an automatic contents list.
- Use numbered lists when order matters, bullets for parallel items and term–description pairs for definitions or options. Keep related items consistent and nesting purposeful. Use supported task lists for actionable work, marking completion only when established.
- Use tables for shared attributes or relationships readers need to compare. Give columns meaningful headers and keep cells concise; use prose or lists when a grid obscures the information. Tables are not page-layout tools.
- Use inline code for exact identifiers, paths, commands and literal values. Separate longer code, commands, configuration and output into code/preformatted blocks, labelled appropriately where supported. Keep excerpts exact and useful, distinguish input from output and identify placeholders.
- Use bold or italic sparingly for meaningful emphasis, terminology or established conventions such as UI labels. Avoid emphasising whole paragraphs or repeatedly highlighting ordinary text.
- Clearly distinguish quotations and retain their wording, attribution and source context. For useful notes or warnings, follow the project's existing callout convention; a labelled plain sentence works without special rendering. Do not add callouts merely to decorate routine explanation.
- Use descriptive links for useful destinations and supporting sources when attribution or verification is needed. Footnotes can hold supporting references or asides where they render; they are not a place to bury required information.
- Use images, figures or diagrams when showing the information helps more than prose alone. Provide text alternatives appropriate to their purpose and captions or explanations where useful; do not make essential meaning depend solely on seeing the visual. This authorises no new asset creation outside the task or unverified accessibility claim.
- Put optional supporting detail after the main answer, link to existing reliable documentation or use clearly labelled collapsible details where supported. Keep essential warnings, required steps and decision context visible beside the relevant action. Do not create files or move content just to shorten a response, or replace a complete answer with an offer to explain more.
- Use specialised markup for keys, abbreviations, math, subscript/superscript, dates or edits only when the subject and renderer warrant it. Thematic breaks can mark meaningful transitions or follow an established layout; avoid adding them mechanically between every section. This is no requirement to introduce HTML controls or redesign a page.
- Default to avoiding em dashes in newly written prose. Use a full stop, comma or colon, or rewrite the sentence. Do not substitute spaced hyphens, double hyphens or en dashes as a workaround.
- Keep meaningful punctuation and Unicode, including hyphens, minus signs, ranges, names and exact syntax. This is not an ASCII-only rule.
- Avoid decorative ellipses, excessive exclamation marks and emoji unless the requested medium or project voice calls for them.

## Global readers

- Avoid unexplained idioms, culture-specific references, double negatives, ambiguous pronouns and long stacks of nouns. Use literal wording and clear references.
- Make important actors, conditions and next actions explicit. Keep dates, numbers, time zones and units unambiguous where relevant.
- Natural contractions can fit the voice; spell them out when meaning could be misread. Do not remove articles or necessary context merely to shorten text.

## Preserve exact content

Do not silently normalise code, identifiers, commands, structured data, quotations, attribution, proper names, licence text or legal obligations. Required notices, templates, safety warnings and technical distinctions take priority over brevity or stylistic preference. Explicitly requested edits to these materials retain their own scope, meaning, syntax and review gates; clearer legal drafting is not legal validation.

## Examples

**Familiar words**

- Before: Utilise this command to commence installation.
- After: Use this command to start installation.

**Keep the warning**

- Before: It is important to note that this action may permanently delete data.
- After: This action may permanently delete data.

**Describe the purpose without hype**

- Before: FooCLI is a robust, seamless solution that empowers developers to effortlessly manage configuration files.
- After: FooCLI helps you manage configuration files.

**Keep the limitation**

- Before: This change leverages caching to improve performance, though it is worth noting that the cache could potentially return stale data.
- After: This change uses caching to improve performance. The cache may return stale data.

**Select details for the question**

For a hypothetical editor, the reader asks whether it works offline:

- Before: Yes. The editor stores files locally, has three colour themes and supports keyboard shortcuts. Cloud sync requires internet.
- After: Yes. You can edit local files offline; cloud sync requires internet.

## Before delivering

Make a short silent revision: check that the answer comes first, each detail serves the reader's purpose, ideas connect without filler and formatting suits the destination. Confirm that requested content, necessary explanations, material facts, qualifications, warnings and required formats survived. Do not add an editing report, extra files, approval requests or tooling just to apply this rule.

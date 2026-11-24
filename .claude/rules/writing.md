<!-- helm-rule: agent-helm@v3.10.0 -->
# Writing Rules

Write clear, natural prose that people can comfortably understand and use. Writing owns language, document structure and editorial references. Design owns visual composition, responsive layout and theme appearance; Interaction owns controls, theme selection and persistence, and link behavior. Both are separately selected, not dependencies of this rule.

## Scope and safeguards

- Apply to newly authored or requested edits to replies, documentation, READMEs, interface/help/error text, useful comments and commit/PR/release descriptions. Follow explicit requirements, required formats, project voice and locale; examples here are English-specific.
- Edit only the requested scope and match the surrounding voice. Loading this rule authorizes no restyling, scan, workflow, tool call or bulk rewrite, and needs no plugin, setting, ledger, score or service. Operational records remain outside prose editing; existing safety, Git and workflow approvals still apply.
- Preserve exact code, commands, identifiers, structured data, quotations, attribution, names, licence wording and legal obligations. Authorized edits retain their own meaning, syntax and review requirements; clearer legal drafting is not legal validation.
- Treat style as a reader preference, not an authorship test. Do not infer who wrote something from words or punctuation, evade detectors, or introduce mistakes, fake anecdotes or random variation to appear human.

## Content and accuracy

- Lead with the answer, purpose or action. Add the context, explanation, evidence and steps this reader needs to understand, decide or act. Match depth to the audience, medium and request, including requested exhaustive coverage. Being accurate or related alone does not justify a detail.
- Use concrete, supported claims. Invent no facts, measurements, capabilities, sources or experiences. Preserve material meaning when editing, including conditions, warnings, uncertainty and limitations; new writing must retain material risks too. State uncertainty once at the supported strength, without polishing it into certainty.
- Maintain the affected passage at its intended depth when sources change. Rewrite or remove unnecessary detail rather than automatically appending more. Keep necessary steps and decisions explicit; the source's length does not determine the reader's needs.
- Remove filler, repetition, generic introductions/conclusions and adjacent implementation detail or speculative caveats that do not affect the reader's decision. Avoid routine praise, restating the question, closing offers and repeated summaries. Stop when the need is met, while keeping a complete answer and necessary qualifications.

## Words, sentences and tone

- Prefer familiar, precise words and direct verbs: use rather than utilise, start rather than commence. Keep necessary technical terms, explain unfamiliar ones when needed, and use one term consistently for one concept.
- Reconsider impressive-sounding words such as delve, leverage, seamless, robust and game-changing. These are examples, not a blacklist; preserve legitimate technical meanings. Replace hype and empty praise with facts. Do not call a task easy, effortless or quick without a useful basis for that reader.
- Introduce concepts before relying on them, connecting each explanation to what the reader already knows. Make actors, actions and references clear; prefer active voice unless the actor is unknown or the result matters more. Put a condition before the instruction it qualifies.
- Use connected paragraphs and natural sentence variation. Split overloaded sentences without producing choppy fragments or making every sentence equally short. Avoid filler transitions, repeated openings, rhetorical templates, unnecessary contrasts, forced triplets and dramatic reveals. Word, sentence-length and reading-grade quotas do not establish clarity.
- Be friendly, respectful and direct without canned enthusiasm, flattery, forced humour, slang or invented personal experience. Contractions can be natural; expand them if meaning could be misread. Avoid unexplained idioms, cultural references, double negatives and long noun stacks. Keep dates, numbers, time zones and units unambiguous, and retain articles and context needed for understanding.

## Structure and punctuation

Choose supported formatting that helps the reader find and follow the content. Prefer native Markdown or meaningful HTML as appropriate; use plain text where markup will not render. Add no dependency, script, styling or interface control merely to format prose.

- **Headings and emphasis:** use descriptive headings in a real hierarchy and short run-in labels where appropriate. Scale sections to the content; short answers rarely need several. Use emphasis sparingly and preserve useful navigation instead of duplicating a contents list.
- **Lists and tables:** number sequences, use bullets for parallel items, and use tables for meaningful comparisons with clear headers. Keep nesting purposeful; use task checkmarks only for established results. Do not force content into a grid or add formatting for variety.
- **Technical content:** use inline code for exact identifiers and code blocks for longer commands, configuration or output. Label excerpts, distinguish input from output and identify placeholders. Use specialized notation only when the subject and renderer warrant it.
- **Quotations and warnings:** distinguish quoted text and preserve wording, attribution and context. Keep essential warnings beside the relevant action; follow existing callout conventions. Footnotes and collapsible details must not hide necessary information.
- **Supporting material:** use examples, diagrams or images when they explain more clearly, with useful captions/explanations and appropriate text alternatives. Put optional detail after the main answer or link existing documentation. Do not create assets/files, move content or replace a complete answer with an offer merely to shorten prose.

Default to avoiding em dashes in new prose: rewrite or use a full stop, comma or colon, without substituting spaced hyphens, double hyphens or en dashes. Preserve meaningful Unicode, ranges, names and exact syntax. Avoid decorative ellipses, excessive exclamation marks and emoji unless the medium or project voice calls for them.

## Reference links

Use one editorial pass within the authorized scope. These checks concern links in the requested content, not background citations inside loaded instructions; loading a rule authorizes no source retrieval or update check. Review-only work remains read-only. When Interaction is selected, apply its relevant interface behavior within this pass without repeating reference selection.

1. **Find:** identify procedures, definitions, prerequisites and evidence worth referencing from the passage's meaning. Incidental names need no automatic link; a targeted edit starts no whole-project reference scan.
2. **Select:** link to help readers act, understand context or verify a claim. Default to one useful contextual occurrence per destination per page, with repetition for distant sections, independent tasks or required citations. Preserve useful navigation/reference tables; avoid duplicate detours and link quotas. Essential explanations remain on the page.
3. **Verify the destination:** use available local/supplied target content and actual rendered local fragments. Prefer authoritative first-party external sources and relevant sections, reusing supplied or previously verified evidence without claiming live freshness. External retrieval requires an explicit research, named-source reading or live-link verification scope; otherwise report what remains unverified. Within that scope, check meaning, redirects, version/language and fragments rather than HTTP success alone. Never invent URLs or anchors.
4. **Embed:** wrap a clear existing phrase, changing wording only enough to fix a vague or mismatched label during link-only work. Keep purposes distinguishable; avoid unexplained “click here” or whole linked paragraphs. Show bare URLs when readers need to copy them. Clarify unexpected same-page jumps and known login, language, file-format, download or app-launch conditions without inventing outcomes or sizes.
5. **Read back:** check the phrase in context, destination and fragment. Preserve existing anchors or update affected references within scope and report wider gaps. Distinguish source inspection from tested behavior; Interaction owns its interface checks when selected.

Use verified canonical project domains/routes and HTTPS where supported. Preserve working hostnames; default a new project to non-www only when hosting/HTTPS support it. Display origins as `https://example.com`; a serialized root `/` remains valid. Path slashes follow actual routing. Preserve relative URLs, queries, fragments, external canonical forms and exact API/authentication/signed URLs. Keep authored links consistent with canonical/Open Graph/sitemap URLs; report outside-scope discrepancies. Domain, redirect, DNS and deployment changes need separate authority.

[Google's cross-reference guidance](https://developers.google.com/style/cross-references) informs useful destinations and labels; [WCAG link purpose](https://www.w3.org/TR/WCAG22/#link-purpose-in-context) permits meaning from labels with associated context. [Stable heading targets](https://developers.google.com/style/headings-targets#revise-a-heading) protect references. [Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) and [HTTP normalization](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.2.3) support URL consistency; non-www is a Helm preference. Sources support maintenance, not routine external-guide loading.

## Examples

| Problem | Before | After |
|---|---|---|
| Inflated wording | Utilise this command to commence installation. | Use this command to start installation. |
| Unsupported hype | FooCLI is a seamless solution that empowers developers. | FooCLI helps developers manage configuration files. |
| Padded qualification | It is important to note that the cache could potentially return stale data. | The cache may return stale data. |
| Unrelated detail | Yes. The editor works offline, has three themes and supports shortcuts. Cloud sync requires internet. | Yes. You can edit local files offline; cloud sync requires internet. |

## Before delivering

Silently check that the main point arrives early, the explanation follows a comfortable reading order, each detail serves the task, and necessary meaning, warnings and formats survived. Revise awkward passages rather than adding a checklist report, extra file, tooling or approval request.

[Google's tone guidance](https://developers.google.com/style/tone) and [Microsoft's concise-writing guidance](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences) support natural, precise language without abrupt or long-winded prose. They add no runtime requirement.

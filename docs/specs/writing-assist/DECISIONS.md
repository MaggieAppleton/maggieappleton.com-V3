# Writing Assist decisions

## 2026-09-27 · 07 reverse outline · Inspection-first redesign

Maggie approved replacing Structure and Flow with a reverse outline: a whole-piece summary, core questions showing what the draft answers or leaves open, compact main moves, and expandable paragraph summaries linked to their original passages. OpenAI generates; Jev checks faithfulness and relevance before display. The feature no longer depends on sentence-role classification and never rearranges text.

Generation runs on opening the drawer or explicit Update outline, rather than the old document idle refresh. Edits mark the accepted snapshot out of date; missing source IDs disable navigation. Block IDs are content-derived, so expansion persists only for unchanged source ranges. Rejected required summaries remain source-linked placeholders; rejected optional questions/observations are omitted. Grouping failure retains the previous accepted snapshot with an error.

Noul judgments have no separate confidence field; code thresholds their finite 0–1 probabilities. Initial thresholds are faithful 0.8, relevant 0.65, grouping 0.75, and observations 0.85. These are configurable starting points, not calibrated quality claims. Complete generation input is limited to 24,000 serialised characters so whole-draft checking fits Jev budgets without truncation; oversized drafts get an explicit error. At most one schema repair and one semantic repair are allowed.

## 2026-09-27 · Shared popovers · Final jig widths

Hover cards are capped at 320px so they cannot exceed the default 340px pinned cards. The link hover is 270px beside its 290px pinned chooser; the repetition pinned card remains 520px. At the jig's single-column breakpoint, paired examples fill the same column width.

## 2026-09-27 · 04 margin checks · Mixed metaphor hover text

The identified metaphors in hover are plain, non-interactive text, matching the pinned card rather than appearing as selectable suggestions.

## 2026-09-27 · 04 margin checks · Pinned loading placeholder

Maggie asked the pinned suggestion skeleton to occupy the suggestion area more fully. It now spans the body width and uses three times the fluid `--space-s` token for height, with the suggestion-card radius. The compact hover loading bar remains as before.

## 2026-09-27 · 05 word finder · Type scale

Maggie asked for consistent sans-serif typography in the word finder, at the margin-check scale. The popover header, input, replacement words, meanings, loading and error states, and Apply button use the design system's smallest `--font-size-xs` token; replacement words remain bold and meanings are grey. The compact selection trigger uses that token too. The popover is 340px wide, and each taller, narrower fit bar sits beside the word so the meaning takes the full row below.

## 2026-09-27 · 06 link suggestions · Unified target typography

Maggie removed growth-stage labels from both hover and pinned target cards, replacing spec 06's small coloured stage label. The label, target title, and description share the same design-system sans-serif size; the target title remains darker and heavier, while the label and description use `--color-gray-600`. The selected target has a single thin sea-blue border. Growth stage data may still be used for suggestion ranking but is not displayed.

## 2026-09-27 · 02 repetition · Hover card bottom spacing

Maggie removed the bottom margin after the final repetition preview sentence in the hover card. Spacing between preview sentences remains.

## 2026-09-27 · 02 repetition · Footer boundary

Maggie asked for the divider above chat to reach both edges of the card and for equal space between the header, each sentence, and that divider. The list uses shared row padding and gap tokens with matching top and bottom padding; the chat's top margin is removed and its full-width divider uses the same inset pattern as the margin-check cards.

## 2026-09-27 · 02 repetition · Open sentence list

Maggie removed the line between the repetition header and sentence list, and the dividers between sentence rows. The separate divider above the chat footer remains.

## 2026-09-27 · 02 repetition · Marker style

Maggie asked the repetition marker to match the margin checks. It now uses a 28px pale salmon circle, a 15px salmon icon, and a 5% salmon border instead of the small solid circle. The live margin checks also now match the jig's previously approved 28px pale-marker treatment, with the additional 4px of text-to-marker spacing; marker positioning uses the new dimensions.

## 2026-09-27 · 04 margin checks · Objection hover inset

Maggie asked for about 4px of left inset on the likely objection explanation in the hover card. It uses 20% of the fluid `--space-s` token; the pinned explanation is unaffected.

## 2026-09-27 · 04 margin checks · Hedging hover spacing

Maggie asked for about 4px more space below the hedging explanation in the hover card. Its bottom margin now derives from 20% of the fluid `--space-s` token. The pinned explanation is unaffected.

## 2026-09-27 · 01 sentence roles · Distribution bars

Maggie asked for the role distribution bars to be at least 4px taller and to show their full scale. The bars are 10px tall, up from 6px, over a full-width, very light grey track made from the existing grey token. The percentage and role labels remain unchanged.

## 2026-09-27 · 01 sentence roles · Hover card padding

Maggie specified roughly 4px vertical, 12px left, and 20px right padding for the sentence-role tooltip. This replaces the shared hover-card padding for that tooltip only. The padding derives from the fluid `--space-s` token at 20%, 60%, and 100%, preserving those proportions across viewport widths.

## 2026-09-27 · 04 margin checks · Mixed metaphor hover inset

Maggie asked for about 20px of right inset on the mixed metaphor explanation in the hover card. It uses the existing fluid `--space-s` token, matching the cliché hover phrase inset across viewport widths. The pinned explanation keeps its current width.

## 2026-09-27 · Shared popovers · Bare header icons

Maggie asked to remove the coloured circle around icons inside hover and pinned popover headers. Header symbols now appear bare at 18px with at least 8px before the title; the margin markers retain their pale circles. This supersedes the earlier decision to match the check popover icon circles to their margin markers. The pinned Dismiss and Close buttons retain their 2px separation.

## 2026-09-27 · 04 margin checks · Hedging direction label

Hedging has two dynamic directions, `overclaiming` and `over-hedging`. Maggie asked their hover and pinned titles to use a colon instead of the dot separator. This replaces the title punctuation in spec 04. The jig's example uses the real `overclaiming` direction rather than its earlier placeholder `soften`.

## 2026-09-27 · Shared popovers · Chat field

Maggie asked the shared pinned-popover chat field to fill the available width, with the send button nestled inside its right edge. The button remains a separate, accessible submit control in the form and is visually positioned over the input's reserved right padding.

## 2026-09-27 · 04 margin checks · Actionable objections

Maggie asked each likely objection to explain the sentence-specific challenge and how the writer could address it. The objection is already generated on demand from that sentence; its prompt now requests a concrete response path in the same short objection text and forbids generic remarks or invented evidence. This extends spec 04's request for the strongest objection alone. The jig labels its fixed text as an example, not a repeated live message.

## 2026-09-27 · 04 margin checks · Cliché popover copy

Maggie removed the cliché reason paragraph from hover and pinned popovers. The validated flagged phrase and replacement suggestions carry the useful information, while the reason remains in chat context. This supersedes spec 04's instruction to show that reason in both states.

## 2026-09-27 · 04 margin checks · Full hover suggestions

Maggie asked the hover card to show every available rewrite or replacement suggestion. This supersedes spec 04's limit of one hedging rewrite and two cliché replacements in hover. Hover and pinned states now present the same suggestion list; the pinned state retains chat and the existing explicit Apply control.

## 2026-09-27 · 04 margin checks · Matching popover icons

Maggie asked every margin check's hover and pinned header icon to match its margin marker. These icons now use the marker's 28px circle, 15px symbol, pale check colour, dark symbol, and 5% accent border. This replaces the small solid circles shown in the approved mockup; repetition, links, and other non-check popovers keep their existing icons.

## 2026-09-27 · 04 margin checks · Citation popover copy

Maggie removed the redundant citation reason from both the hover card and pinned popover. This supersedes spec 04's instruction to display the fixed reason in those two places. The “Citation needed” title and pinned chat remain; the reason stays in the chat system context but is not shown in the UI. Empty pinned bodies are omitted so the chat sits directly below the header.

## 2026-09-27 · Sentence roles · Mixed classification tint

Maggie asked for the sentence tint to show the probability split when several roles are substantial. This supersedes spec 01's exactly one solid colour. Roles at or above the existing 10% hover threshold form a soft gradient with lengths proportional to their probabilities; effectively single-role sentences keep their solid tint. A separate, non-interactive overlay paints wrapped text lines because CSS Custom Highlights cannot paint a background image. The role annotation and hover card remain unchanged, and no tint enters Lexical or MDX.

## 2026-09-26 · 00 foundation · Default text generator

Maggie asked for OpenAI `gpt-6-sol` as Writing Assist's default text generator. The debug tool therefore uses OpenAI `gpt-6-sol` instead of the Anthropic Haiku model shown in the approved foundation config. `OPENAI_MODEL` can override the model, and the OpenAI provider is available when its API key is set. The Anthropic adapter remains available for tools that select it. This changes the default provider and model; the interface and tool behaviour stay as specified.

## 2026-09-26 · 02 repetition · Default text generator

Maggie confirmed that OpenAI `gpt-6-sol` is the default text generator for Writing Assist itself. Repetition chat therefore uses OpenAI `gpt-6-sol` instead of the Anthropic model in spec 02. `OPENAI_MODEL` can override it; the Anthropic provider remains selectable and is still checked live at the end of the slice. The repetition analysis remains with Jev.

## 2026-09-26 · 03 argument map · Oversized Jev requests

Spec 03 asks Requests A and B to run in parallel, with A using each paragraph's first two sentences plus the main sentence chosen by B when the full document is too large. Because B's answer is unavailable when parallel requests are built, oversized A states use the first two sentences only. A's title is capped at 256 characters. Each request state is capped at 32,000 characters, and each serialised `{ state, questions }` request at 64,000 characters. Oversized A and B question sets are batched with the same relevant state; B groups paragraphs with their following quotes and keeps at least 32 characters of each longer candidate sentence and quote when compacting. Normal documents still use the specified two parallel requests. An extreme document whose A paragraph and quote tags cannot fit, or whose single B paragraph group cannot retain that minimum text, returns an error instead of sending a content-free or oversized request.

Jev `choice` allows at most 255 options. Spec 03 caps parent choices but does not cap the thesis or main-sentence choices. Those two questions sample up to 255 evenly spaced candidates when a document has more than 255 analysed paragraphs or a paragraph has more than 255 sentences. The full candidate set cannot be represented in one choice question.

## 2026-09-26 · 03 argument map · Quoted evidence

Spec 03 says quoted blocks count as evidence, but does not ask Jev which claim each quote supports. A quote immediately after a claim, before the next analysed paragraph or heading, therefore prevents the “No supporting evidence” flag for that claim. Quotes stay in both Jev request states as `[quote]` context. They are not clickable map leaves because protected quoted blocks do not provide a reliable editor jump target.

## 2026-09-26 · 04 margin checks · Default text generator

Maggie's OpenAI `gpt-6-sol` default also applies to margin check hover suggestions and chat. Both use OpenAI `gpt-6-sol` instead of the two Anthropic models shown in spec 04; `OPENAI_MODEL` can override the model. Check detection remains with Jev, and the Anthropic provider remains available and is checked live.

## 2026-09-26 · 04 margin checks · Objection threshold

The spec's 0.7 objection threshold produced 34 markers across 53 sentences in a real essay, obscuring the writing. At 0.85, three sentences qualify. The configured threshold is 0.85; the other margin-check thresholds remain at their specified starting values. This follows the spec's preference for fewer unnecessary flags.

## 2026-09-27 · 04 margin checks · Hedging calibration

Spec 04 subtracts underlying uncertainty from wording certainty. Both scales run from 0 to 4, but a larger value on either scale increases the risk of overclaiming. Subtraction therefore flagged a confident account of a settled personal event: the local cached Jev scores were 2.93 for wording and 0.10 for uncertainty, producing a 2.83 gap. It also misses tentative wording around supportable claims.

The check now adds the two scores. It marks overclaiming only at a sum of at least 7 with wording certainty at least 3, and over-hedging only at a sum of at most 2 with wording certainty at most 1.5 **and** underlying uncertainty at most 1 (settled or widely accepted). The supportability guard prevents a tentative debated claim from being misread as needless hedging. The existing confidence gate remains. Jev is explicitly told that ordinary first-person actions, observations, and memories are supportable personal reports. Generation follows the flagged direction, preserves names and concrete facts, and avoids adding uncertainty to ordinary personal experience. The changed question text changes the cache key, so old answers are not reused.

Maggie clarified that this is a personal blog: firsthand experiences, feelings, preferences, and opinions are the author's own evidence. When citation or hedging is enabled, Jev now answers a per-sentence `personal` question. A high personal-only probability (at least 0.8) suppresses citation and hedging when it is at least as high as the citation probability, if one is available. When the two answers conflict, stronger evidence for a sourced external claim keeps the sentence eligible. The questions explicitly distinguish personal details from separable historical, geographical, research, company, tool, and third-party facts. This departs from spec 04's citation and hedging questions and mapping; it does not grant a blanket exemption to sentences containing “I”.

## 2026-09-26 · 05 word finder · Default text generator

Maggie's OpenAI `gpt-6-sol` default applies to word finder candidate generation. This replaces the Anthropic Sonnet model shown in spec 05; `OPENAI_MODEL` can override it. Ranking still uses Jev, and the Anthropic provider remains available and is checked live.

## 2026-09-26 · 05 word finder · Selection scope

Spec 05 permits a selection anywhere within one analysed block, while its generation and ranking requests require a single complete sentence with the selected text marked. The editor therefore offers Word Finder only when the selection also stays within one analysed sentence. This avoids sending a partial or ambiguous sentence to either provider; a phrase inside that sentence still works up to the specified 12-word limit.

## 2026-09-26 · 06 link suggestions · Document refresh scope

Spec 06 asks to analyse only blocks changed since the last run. The document scheduler sends the full block snapshot on a refresh so the link tool can deduplicate target suggestions across the whole post and replace stale annotations in one pass. The tool rechecks every block locally, but the sidecar cache reuses Jev answers for unchanged block state. This changes local refresh work; unchanged blocks do not cause new Jev calls.

## 2026-09-27 · 04 margin checks · Show the validated cliché phrase

The spec 04 popover body now identifies the exact cliché phrase in hover and pinned popovers after the editor validates and marks its source span, before the replacement suggestions. Unaccepted or stale generated phrases stay hidden from the UI and chat context; replacement suggestions and the existing Apply safety gate remain unchanged.

## 2026-09-27 · Hover cards · Select from the preview

Maggie asked to move from a Writing Assist trigger into its hover card and click a suggestion. Cliché and hedging preview rows, and link target previews, therefore open the pinned popover with the clicked option selected. Applying a rewrite or link still requires the explicit Apply or Link action in that popover. This adds a click path to the previously read-only hover previews in specs 04 and 06; clicking a marker to pin and the existing keyboard and touch path remain available.

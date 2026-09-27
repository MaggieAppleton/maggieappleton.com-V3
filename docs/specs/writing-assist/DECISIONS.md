# Writing Assist decisions

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

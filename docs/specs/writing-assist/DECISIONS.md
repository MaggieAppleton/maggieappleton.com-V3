# Writing Assist decisions

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

## 2026-09-26 · 05 word finder · Default text generator

Maggie's OpenAI `gpt-6-sol` default applies to word finder candidate generation. This replaces the Anthropic Sonnet model shown in spec 05; `OPENAI_MODEL` can override it. Ranking still uses Jev, and the Anthropic provider remains available and is checked live.

## 2026-09-26 · 06 link suggestions · Document refresh scope

Spec 06 asks to analyse only blocks changed since the last run. The document scheduler sends the full block snapshot on a refresh so the link tool can deduplicate target suggestions across the whole post and replace stale annotations in one pass. The tool rechecks every block locally, but the sidecar cache reuses Jev answers for unchanged block state. This changes local refresh work; unchanged blocks do not cause new Jev calls.

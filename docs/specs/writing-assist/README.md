# Writing Assist

Writing Assist adds a suite of AI tools to the local writing editor (`/_editor`, dev only). The tools help Maggie see the structure of an argument, find weak spots, and choose better words while she writes. Every piece of it is dev only. None of it ships to the public site.

There are two kinds of model:

- **Jev** (TypeSafe's System One model, `jev-latest`) does the judging: classifying, scoring, yes/no probabilities and ranking. It is fast and cheap, and it returns calibrated probabilities, so it can run all the time in the background. It cannot generate text. Docs: https://docs.typesafe.ai/llms.txt. Read `/primitives`, `/patterns/fan-out`, `/patterns/confidence-routing`, `/cookbooks/semantic_find` and `/model-jaggedness/jev-1.13` before you build anything with it.
- **Text generation models** (Anthropic, OpenAI, or a local OpenAI-compatible server) write suggestions and chat replies. They only run when Maggie hovers or clicks, never in the background.

The principle: **Jev decides what is worth showing, and a generation model writes only when asked.**

## Mockups

The approved visual designs are in [`mockups/`](mockups/README.md). Open them in a browser before building any UI.

## Specs and build order

Each spec is one vertical slice and one PR. Build them in this order:

| # | Spec | Depends on | Summary |
|---|------|-----------|---------|
| 00 | [Foundation](00-foundation.md) | — | Sentence model, assist routes, provider adapters, sidecar store, overlay rendering, popover system, Assist panel, drawer shell |
| 01 | [Sentence roles](01-sentence-roles.md) | 00 | Colour tint behind each sentence by role; hover shows the role split |
| 02 | [Repetition finder](02-repetition.md) | 00, 01 | End-of-sentence mark on repeated points; popover lists every instance |
| 03 | [Argument map](03-argument-map.md) | 00, 01 | Drawer with Structure and Flow views; click to jump |
| 04 | [Margin checks](04-margin-checks.md) | 00 | Citation needed, hedging mismatch, likely objections, clichés, mixed metaphors |
| 05 | [Word finder](05-word-finder.md) | 00 | Select a word or phrase and get ranked alternatives |
| 06 | [Link suggestions](06-link-suggestions.md) | 00 | Dotted underline on phrases that could link to other site content |

Once 00 lands, slices 04, 05 and 06 are independent and can run in parallel. Slices 02 and 03 read the roles from 01.

## Decisions every spec shares

These are settled. Don't reopen them in individual specs.

- **Dev only.** All routes are injected only when `command === "dev"` and are guarded like the existing `/_editor/api/document` route (origin and token).
- **Nothing is written into the document.** Annotations are an overlay. They are never Lexical nodes or marks and never reach the MDX. Only an explicit **Apply** changes text, and it does so as a normal Lexical update, so undo and autosave work unchanged.
- **Analysis runs at two speeds.** Sentence-level tools run on a changed paragraph about 1.5 s after typing stops. Document-level tools (repetition, argument map, link suggestions) run after about 8 s idle, or when their UI opens.
- **What gets analysed.**
  - Analysed: paragraphs, list items, headings, and the editable writing components `IntroParagraph`, `Footnote` and `AssumedAudience`.
  - Not analysed: code, frontmatter, other JSX components.
  - Quotes (blockquotes, `QuoteCard`, `BlockquoteCitation`) get no annotations, but they are passed to document-level tools as quoted evidence.
- **Dismissals and the cache** live in gitignored sidecar files at `.writing-assist/<collection>/<id>.json`, keyed by a hash of the sentence text. Editing a sentence changes its hash, so its old dismissals and cached results stop applying.
- **Providers can be swapped per tool** through one config file. API keys come from `.env`. If a tool's provider has no key, the tool shows as unavailable in the Assist panel along with the reason.
- **Language:** British English (`en-GB`) everywhere: segmentation, prompts and generated suggestions.
- **Visual language** (approved mockups are described in each spec):
  - Colours come from `src/global.css` tokens through `color-mix()`, so dark mode works automatically.
  - Icons come from `@phosphor-icons/react`.
  - Pinned popovers have a trash icon button (Dismiss, with a tooltip) to the left of an X icon button (Close) in the top-right corner.
  - **Apply** is a primary button in the bottom right, shown only when applying is simple and obvious.
  - Components contain no instructional text.
  - Only one pinned popover can be open at a time.

## Out of scope

Grammar and spelling checks, "say what I mean" rewriting, voice matching, a UI sensitivity slider, retiring `[[wiki links]]`, and anything that runs outside `npm run dev`.

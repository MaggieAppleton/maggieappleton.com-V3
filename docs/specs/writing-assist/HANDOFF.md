# Handoff: build Writing Assist

You are the **long-running orchestrator** for building Writing Assist: a suite of AI writing tools inside Maggie Appleton's local, dev-only MDX editor. The design is finished and approved. Your job is to turn it into working, tested code in a series of reviewable slices, and to check in with Maggie at the checkpoints listed below.

- **Repo:** `maggieappleton.com-V3`
- **Branch:** `maggie/writing-assist`. It contains the specs and mockups only. No implementation code has been written yet.

## 1. Read these, in this order

1. `AGENTS.md`: the project overview and tech stack (Astro, minimal React, JavaScript over TypeScript).
2. `docs/specs/writing-assist/README.md`: what Writing Assist is, the build order, and **the decisions every spec shares**. Treat these as settled.
3. `docs/specs/writing-assist/mockups/README.md`, then **open every mockup in a browser**. The green banner on each says which option was approved. The mockups decide the look; the specs decide behaviour and copy.
4. `docs/specs/writing-assist/00-foundation.md`, in full, including the "Existing code to build on" section.
5. The existing editor code that 00 names:
   - `src/editor/integration.mjs`
   - `src/editor/routes/document.js`
   - `src/editor/server/request-guards.mjs`
   - `src/editor/client/mount.mjs`
   - `src/editor/client/editor-dock.mjs`
   - `src/editor/client/mdx-adapter/editor-adapter.mjs`
   - `src/editor/client/mdx-adapter/selection-sync.mjs`
   - `src/editor/client/mdx-adapter/writing-jsx-node.mjs`
   - `src/editor/client/writing-editor.css`
   - `tests/editor/` and `playwright.editor.config.mjs`
6. The **Jev / TypeSafe docs**. Start from https://docs.typesafe.ai/llms.txt and read at least:
   - `/introduction`, `/concepts/state`, `/primitives` (plus the choice, score and noul pages), `/confidence`
   - `/patterns/fan-out`, `/patterns/confidence-routing`
   - `/cookbooks/semantic_find`, `/cookbooks/pre_parsed_value_extraction_cookbook`, `/cookbooks/rerank_typesafe`
   - `/model-jaggedness/jev-1.13` (the known limits: no counting, literal reading, distracted by irrelevant context)
   - `/sdk/javascript` and `/api`
7. Specs 01 to 06. Read each one just before you build it, and read all of them once at the start so the foundation's interfaces fit what's coming.

## 2. How to work

- **Slices:** one spec is one slice is one PR. Order: 00 → 01 → 02 → 03 → 04 → 05 → 06.
  - Once 00 is merged, 04, 05 and 06 don't depend on each other.
  - 02 and 03 need 01.
  - You may run independent slices in parallel with sub-agents, each in its own worktree.
- **Branching:**
  - For each slice, create `maggie/writing-assist-NN-<slug>` from the latest `maggie/writing-assist` and open a PR back into `maggie/writing-assist`.
  - Merge a slice PR yourself only after its tests pass and a separate review pass (a fresh sub-agent reading the diff against the spec) finds no blocking issues. Checkpoints are the exception: see section 3.
  - Maggie merges `maggie/writing-assist` into `main` at the end.
- **Break down before building.** For each slice, write a short task list in the PR description and work through it test-first. Keep files small and single-purpose. Match the existing editor code style: `.mjs`, JavaScript, `React.createElement` with no JSX, tabs.
- **Tests:**
  - `npm run test:editor` and `npm run test:editor:e2e` must pass on every PR.
  - `npm run build` must pass, and the production build must contain no assist code.
  - Tests never call live APIs. Mock Jev and the language model providers.
- **Visual check:** for every slice with UI, run `npm run dev`, open a real post in `/_editor`, and compare it with the relevant mockup. Put screenshots in the PR, in both light and dark mode.
- **Live check:** at the end of each slice, run one manual pass against the real Jev and Anthropic APIs, using the keys in `.env`. Write down in the PR anything that behaved differently from the mocks.
- **Deviations:** if you must depart from a spec because of a technical limit, a Jev behaviour, or an MDXEditor constraint, record it in `docs/specs/writing-assist/DECISIONS.md` (the date, the spec section, what changed and why), and mention it in the PR.
  - Don't change behaviour that users will notice without asking Maggie.
  - Spec thresholds are starting points. Tune them in `config.mjs` and note the values you chose.

## 3. Checkpoints: stop and ask Maggie

Stop at each of these, post a short summary with screenshots or a short screen recording, and wait for her go-ahead:

1. **After 00 is working,** before you merge it: the debug tool running end to end against the live APIs.
2. **After 01,** before you merge it: role tints on a real essay. The colours and intensity need her eye.
3. **After 04's hover cards and pinned popovers work** on one check, before you build the other four checks.
4. **Before you merge the final slice.**

Also stop and ask whenever:

- A decision would change what Maggie sees or does and the spec doesn't settle it.
- An API key is missing or a paid API is behaving unexpectedly.
- A slice turns out much larger than its spec suggests.

Keep messages to Maggie short: what's done, what you need, and screenshots.

## 4. Hard rules

- Everything is **dev only**. Nothing may ship in `npm run build` output or reach the public site.
- **Annotations never enter the document.** No Lexical nodes or marks for annotations. With annotations showing, saved MDX must be byte-identical to what it would otherwise be. Only an explicit Apply or Link changes text.
- **Never commit secrets.** Keys live in `.env`, which is gitignored. Keep `.env.example` up to date.
- **Don't edit content** in `src/content/`, except for throwaway fixtures inside the tests.
- **Don't remove or change `[[wiki link]]` support.** That's out of scope.
- British English (`en-GB`) in all prompts and generated text.
- Use the design tokens from `src/global.css` and Phosphor icons (`@phosphor-icons/react`). Respect `prefers-reduced-motion`.

## 5. Environment Maggie will provide

`.env` will contain `TYPESAFE_API_KEY` and `ANTHROPIC_API_KEY`. `OPENAI_API_KEY`, `OPENAI_MODEL` and `LOCAL_LLM_BASE_URL` are optional; the related providers must show as unavailable when these aren't set. If a key you need is missing when you reach a live check, stop and ask.

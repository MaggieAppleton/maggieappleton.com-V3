# Local writing editor verification

## Baseline

- Repository/worktree: isolated `maggie/local-writing-editor` checkout.
- Base: `a2593f37728b6ffb61231041b129622fe752acec`.
- `npm ci`: exit 0; 851 packages installed. Node 24.10.0, Astro 5.1.3, React 18.3.1, @astrojs/mdx 4.0.1.
- `node --test tests/*.test.mjs tests/*.test.js`: exit 0, 66 passed. Raw log: `.local-writing-editor/baseline-node-tests.log`.
- First disposable build failed because symlinked dependencies confuse Astro style-module paths (harness failure, not a product failure). Retried the unchanged site in this worktree with generator-output backups: `npm run build:local` completed 195 pages in 725.47s, including 8,296 image variants. Raw log: `.local-writing-editor/baseline-build-local-worktree.log`. Future disposable projects clone/copy dependencies and asset cache rather than symlinking them.
- GitHub access verified. Legacy required-status-check API returns “Required status checks not enabled”; effective rules for `main` are empty. Recheck PR conclusions at handoff.
- Authored-content inventory: 173 files under `src/content`; hashes stored in `.local-writing-editor/content-baseline.json`.
- Handoff integrity: all five manifest SHA-256 entries verified before and after extraction.

## Corpus

116 in-scope MDX files: 22 essays and 94 notes, including 19 drafts. 113 contain JSX; 70 contain wiki links. The current corpus has no nested source versions, so version identity coverage uses synthetic fixtures. Inventories are recorded under `.local-writing-editor/`. All 116 full save requests fit the 10 MiB limit; the largest serialized JSON request is 56,589 bytes (`growing-a-human.mdx`). Measurement: `request-size-corpus.json`.

## Acceptance status

Implementation and required checks are in progress. No acceptance result or PR readiness is claimed here yet. Raw test logs, screenshots, and the final tested-head record live in ignored `.local-writing-editor/`.

The complete acceptance matrix is in the supplied `docs/superpowers/plans/local-writing-editor/verification.md`. Results will be recorded here by S1–S3, F1–F3, R1–R2, B1–B4, D1, V1–V2, P1–P2, and I1 as completed.

| Requirement | Current evidence | Remaining |
| --- | --- | --- |
| S1 / S3 source | 26 source cases pass, including independent-review regressions, BOM/CRLF/Unicode, protected removal, list marker contexts and empty supported wrappers. Actual engine synthetic source cases pass. | Complete integrated writing and protected-node interaction gates. |
| S2 corpus | 116/116 actual-engine byte-identical no-op; 114 existing-text edits and two component-only insertions preserve protected source/frontmatter and compile. | Final integrated rerun after remaining adapter changes. |
| F1–F3 persistence/guards | Eight guard, fourteen index/store, seven deterministic race, and eight candidate-validation tests pass. Guards and service/index reviewed. Four real HTTP tests pass, including valid persistence and rejection/no-CORS/no-store matrix. | Draft creation, full integrated head rerun. |
| R1–R2 session/recovery | Session module independently reviewed; 19 deterministic state, ordering, conflict, composition and storage tests pass. | Live binding, delayed/failing saves, conflict/restart/navigation browser tests. |
| B1–B4 writing | MDXEditor same-root browser probe preserves no-op, second repeated paragraph, nested footnote, and undo after blur. | Integrated writing, selection, composition, protected nodes, watcher/caret/history tests. |
| D1 drafts | Creation defaults documented. | Note/essay UI, exclusive service, restart/discovery and production tests. |
| V1–V2 rendering | Original Astro rendering seam independently inspected. | Representative normal/edit pairs, protected real assets/layout/custom interaction. |
| P1 production | Base static build passes. | Feature build/output/HTTP isolation with sentinel draft. |
| P2 regressions | Base suite: 66 pass. | Final suite, verify:html, representative normal pages. |
| I1 integrity | 173 original content files inventoried; baseline generated outputs unchanged. | Final hash/diff audit and exclusion of transient files. |

Fixture smoke proves a copied project with copied writable targets, content generator prelude, a uniquely identified loopback server, owned process-group shutdown, free port, and owned-directory cleanup. Initial review findings and their fixes are logged under `.local-writing-editor/fixture-*.md`.

## Source foundation checkpoint

Fresh pre-commit checks in this worktree: `node --test tests/editor/source.test.mjs tests/editor/corpus.test.mjs tests/editor/requests.test.mjs` exited 0 (35 tests); `node --test tests/*.test.mjs tests/*.test.js` exited 0 (66 tests); `git diff --check` exited 0. Installed versions remain Astro 5.1.3 / React 18.3.1, with MDXEditor 4.2.5 under compatibility evaluation. All 173 original content hashes match the initial inventory. Detailed source review: `.local-writing-editor/source-review/rereview-3.md`.

## Persistence foundation checkpoint

Fresh `npm run test:editor`: exit 0, 64 tests pass; existing Node suite: exit 0, 66 pass. The shared note/essay schemas retain the site’s existing fields and date validation. Candidate validation accepts representative edits across all 116 current files. Independent tests found and verified fixes for swapped repeated-component attributes, invalid cover files, duplicate indexed identities, and a symlink alias used as a write target. Service/index spec and quality review passed. Raw evidence: `.local-writing-editor/service-*-tests.log`, `service-review/report.md`, and `validation-tests-report.md`. Live HTTP endpoints remain pending.

All 172 baseline authored MDX/JSON files remain byte-identical. `src/content/config.ts` is intentionally changed only to reuse the shared schema factories.

## First live integration checks

The real HTTP suite passed 4/4 in an owned disposable project (50.5 s). It covers no-ID session bootstrap, malformed raw source, valid authenticated reads/writes, wrong identities/hosts/origins/tokens/methods/content types, oversized bodies, no-store/no-CORS, and unchanged files after rejection. The first run caught Vite’s wildcard CORS header; the dev server now disables CORS explicitly. Evidence: `.local-writing-editor/http-tests-report.md` and `http-tests-final.log`.

The first real MDXEditor page mounts without browser errors and transplants three original protected Astro regions. This is not rendering acceptance: an initial cozy-web comparison found an incorrect body font/width, absent drop cap, and changed image width. Both Cloudinary images loaded in that comparison. Detailed metrics/screenshots are in `browser-evidence/cozy-web-first-review.*`; the drift is being corrected before V1/V2 acceptance.

## Session module checkpoint

Fresh `node --test tests/editor/session.test.mjs`: exit 0, 19 passed. Independent bounded spec and quality review passed (`.local-writing-editor/session-review.md`). Cases cover debounce, one request in flight, generation-specific acknowledgements, uncertain retries, late responses, per-tab recovery, storage failure, explicit disk replacement, and composition/conversion recovery. Review regressions include conflict status while typing and retaining the durable recovery when discarded-copy archival fails. This result covers the state coordinator; live browser binding and navigation remain separate acceptance gates.

## Actual engine corpus checkpoint

The copied-project browser corpus passed 2/2 cases in 1.1 minutes using the production MDXEditor adapter: all 116 unchanged imports exported byte-identically; 114 files received an existing-text keyboard edit, and the two component-only files received a paragraph insertion. Every candidate preserved exact frontmatter/protected source and compiled with MDX/frontmatter/GFM. The synthetic case covers repeated prose, BOM/CRLF, Unicode, supported nesting, version identity and no terminal newline. Input copies remained unchanged. Evidence: `.local-writing-editor/corpus-engine-report.md` and `browser-evidence/corpus-engine-outcomes.json`.

This is source compilation, not 116 individual Astro runtime renders. Representative real rendering and the final site build remain separate gates. The corpus exposed semantic equality depending on JavaScript key insertion order; a canonical comparison and direct regression fix that without changing source identities or supported semantics.

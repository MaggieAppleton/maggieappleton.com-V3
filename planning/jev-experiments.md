# Jev experiments implementation

Internal implementation notes, not article copy. The user owns the title, subtitle, and prose. Use the administrative label `Jev experiments` for the draft preview only.

## Scope and decisions

- A draft MDX note at `/jev-experiments` contains the state → questions → probabilities → code diagram and all five working experiments.
- Existing cream, Canela, Lato, crimson, and sea-blue design tokens; compact controls; progressive disclosure; keyboard access and reduced-motion support.
- Public, canonical garden content only enters generated data. Drafts stay excluded.
- Four experiments use genuine saved Jev responses. Search uses a protected Astro server endpoint. No invented model scores or responses.
- No prose, article title, introduction, conclusions, or automatic edits to existing content.
- Server credentials remain in `.env`; generated data contains provenance but never credentials.
- Keep static page output; add the Vercel adapter for the one live endpoint. No deployment requested.

## Modules and acceptance

1. `src/lib/jev/corpus.js`, `rubrics.js`, `client.js`, `search.js`: deterministic content extraction, narrow questions, validated API calls, retrieval and ranking. Test draft exclusion, canonical versions, response validation, result ranking and missing-answer behaviour.
2. `scripts/jev/generate.js`: resumable cached real evaluation, writes `src/data/jev/garden.json`. Every published document gets lenses and tending judgements; relationships are evaluated over candidate pairs; epistemic analysis covers deterministically derived sentences with neighbouring sentence context. Record model, time, token use, and source hashes.
3. `src/pages/api/jev-search.js`: validates requests, bounds work, limits requests, caches results, keeps key server-side; handles provider errors without exposing request contents or credentials.
4. `src/components/unique/jev/`: five compact React experiments inside Astro wrapper. Sliders rank cards; live search compares lexical and semantic rankings; graph displays directed typed edges and evidence; linter highlights sentence-level claim types and independent review marks over the article text; tending groups all maintenance recommendations into one expandable report per post. A shared inspector shows actual requests/results.
5. Draft MDX integration, local dev server, desktop/mobile browser verification and focused Node tests. The user explicitly warns full builds are image-heavy: use dev-server verification, not a full production build. Verify all five against real API output before completion.

## Data interface

Snapshot: `{version:1, generatedAt, model, corpusHash, usage:{input_tokens,output_tokens}, documents, relations, examples}`.

Document: `{id,title,description,type,topics,growthStage,url,updated,wordCount,imageCount,codeBlocks,inbound:string[],outbound:string[],paragraphs:[{id,text,heading,citations:string[]}],lenses,tending,epistemic}`.

`lenses` maps `knowledge`, `practicality`, `abstraction`, `speculation` to real Score answers `{type:'score',score:0..4,confidence,probabilities,legend}`.

`tending` maps `growth_stage` to Choice; `title_fit`, `description_fit` to Noul; `topic_<index>` to Noul over snapshot-wide sorted topics. `suggestedTopics` stores `{topic,probability}` suggestions after excluding existing topics. Deterministic observations available from document metadata.

`epistemic` is `[{sentenceId,paragraphId,kind:Choice,needsCitation:Noul,qualification:Noul}]`. Sentence IDs are deterministic within source paragraphs. Kind options: empirical, interpretation, speculation, normative, metaphor, personal, non_claim. `needsCitation` means an externally checkable claim for which the sentence or supplied neighbouring context contains no supporting citation. `qualification` means language expresses more certainty than supplied evidence supports. The UI applies each signal independently and displays it only at 50% confidence or higher.

Relation: `{source,target,kind:Choice,meaningful:Noul,sourceParagraph:Choice,targetParagraph:Choice,authored:boolean}`. Kind describes source → target: prerequisite (target supplies background), continuation (target develops source), example (target exemplifies source), precedent (target supplies historical precedent), tension, contradiction, overlap. Evidence choices point to paragraph IDs or `none`.

`examples` contains real `{request,response}` for a document and a relation. `documents` may be empty before generation, and `generatedAt` null. UI must honestly display missing-data state, never synthetic scores.

Search POST `/api/jev-search`: `{query:string}` → `{query,model,cached,elapsedMs,exists:number,usage,lexical:[{id,score,excerpt}],results:[{id,score,excerpt}],inspection:{request,response}}`. IDs map to snapshot documents. Short queries use lexical preview in browser; server returns at most 20 semantic candidates and a separate answer-exists judgement.

## Progress

- All five experiments implemented in the draft note; no authorial prose or subtitle. The administrative preview title remains `Jev experiments`.
- Quoted `.env` key works with the generator and restarted dev server. `.env` and `.cache/jev/` remain ignored.
- Genuine saved evaluations: 142 published canonical entries, 5,374 text/image-description passages, 10,149 derived sentences, 1,136 candidate relationships; model `jev-1.13.0`. Snapshot request ledger totals 8,396,384 input tokens (about $0.35 for its recorded evaluations; iteration calls are additional).
- `npm run test:jev`: 25 passing tests. `npm run jev:check`: complete source hash, 10,149 sentence records, metadata, evidence references, probabilities and usage-ledger validation.
- Browser: lens sliders rerank; selected distributions render; live search returns reordered source passages and probabilities; absent-topic query returns a low probability; stopword-only query has no invented probability. Graph filters and selected evidence work. Linter renders full article text with sentence highlights, independent citation/qualification marks, review modes, and hover/focus probabilities. Tending shows 142 unique post reports containing 624 recommendations, grouped into metadata, classification, connections, and freshness; category filtering, recommendation/title search, sorting, expansion, provenance, and raw inspection work.
- Viewports: normal desktop preview plus 375×812 mobile; no horizontal overflow; the sentence tooltip becomes a viewport-safe fixed card on narrow screens. Browser reports no console warnings/errors. Citation and qualification review modes preserve all 41 sentences in the checked article while muting unrelated marks.
- Endpoint rejects short/malformed JSON (400), oversized input (413), cross-origin calls (403), and wrong content type (415).
- Independent read-only review: no remaining important/critical findings after fixes. Rate limits/cache remain process-local safeguards; no public deployment performed.
- Experiment 5 reused the saved snapshot; no Jev regeneration was needed.
- Production build intentionally not run. Development preview is served at `http://127.0.0.1:4322/jev-experiments`.

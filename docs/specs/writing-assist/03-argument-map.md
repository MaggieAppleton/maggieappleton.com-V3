# 03 · Argument map (replaced)

The original sentence-extraction Structure and Flow design is superseded by [07 · Reverse outline](07-reverse-outline.md), approved on 2026-09-27.

The Map drawer now inspects a draft through a whole-piece summary, core questions with answer status, and a compact ordered outline with expandable paragraph summaries and source links. OpenAI generates the interpretation; Jev checks its faithfulness and relevance against the original passages. Flow and sentence-role inventories are removed from this feature.

The tool retains `argument-map` as its transport identity, with version 2 and a new map schema. It depends on foundation services and both configured providers, but not on sentence-role classification. Generation runs on drawer open or explicit Update outline; edits mark an existing outline out of date.

No text is rearranged or rewritten. See spec 07 for the full UI, validation, repair, cache, and lifecycle contract.

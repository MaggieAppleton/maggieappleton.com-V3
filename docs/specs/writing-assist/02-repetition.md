# 02 · Repetition finder

Finds sentences that make the same point in different words. A small mark at the end of each such sentence opens a list of every sentence in that group and where it sits in the piece.

Depends on [00 · Foundation](00-foundation.md) and [01 · Sentence roles](01-sentence-roles.md).

## What counts as repetition

Two sentences repeat each other when a careful reader would say they **make the same point**, even if the wording differs completely. Sentences that merely share a topic, or where one builds on or develops the other, do **not** count.

Only substantive sentences take part: those whose assigned role (from spec 01) is `claim`, `opinion`, `evidence` or `speculation`. Framing, examples, qualifications, concessions, headings and quoted blocks are excluded. This keeps the number of candidates down and avoids flagging deliberate signposting.

## Jev

- Tool id `repetition`, `level: "document"`.
- **Candidate set:** the substantive sentences in document order, tagged `S1…Sn`.
- **One request for the whole document** (split it if it gets too large, as described below):
  - State: `{ title, sentences: "S1| …\nS2| …" }`, containing the candidate sentences only.
  - For each candidate `Si` with `i ≥ 2`, ask one `choice` question, keyed `same_S{i}`.
    - Instructions: `Which earlier sentence makes the same point as S{i}, in different words? Choose "none" if no earlier sentence makes the same point.`
    - Criteria: `{ none: "No earlier sentence makes the same point", S1: null, …, S{i-1}: null }`.
  - Choice options are capped at 255. If `i - 1 > 254`, offer only the 254 nearest earlier sentences.
- **Batching:** if there are more than about 150 candidates, split the questions across several requests. Each batch shares the same full `sentences` state and carries a slice of the questions. The requests run in parallel.
- **Pairs:** every earlier sentence `Sj` whose probability is ≥ `thresholds.pair` (default 0.5) forms the pair `(Si, Sj)`. More than one earlier sentence can pass.

**Clustering (in code, never in Jev):** join the pairs with union-find into groups. A group is flagged when its size is ≥ `thresholds.minGroup` (default 3). A pair on its own is often a deliberate echo, such as intro and conclusion; `minGroup` is in config so this can be tuned.

- `mapAnswers` returns one annotation per sentence in each flagged group:
  ```js
  {
    tool: "repetition", kind: "repeat",
    target: { type: "sentence", sentenceId },
    confidence: <mean pair probability in group>,
    data: { groupId, members: [sentenceId…] },   // members in document order
  }
  ```
- `groupId` is the hash of the sorted member hashes.

## Display

- An **end mark**: a 17px salmon circle (`--color-salmon`) with a white Phosphor `ArrowsClockwise` icon, placed just after the sentence's last character. Every sentence in the group gets one.
- Hover card:
  - Title "Same point, {n} times".
  - The first line of each other member, truncated to one line.
  - No actions.
- The pinned popover opens on click:
  - **Header:** the `ArrowsClockwise` circle, "Same point, {n} times", then Dismiss (trash) and Close (X).
  - **Body:** one row per member in document order.
    - Left: its paragraph label `¶{index+1}`, small and grey.
    - Right: the **whole sentence** text.
    - The sentence the popover was opened from is bold.
    - Clicking a row calls `jumpTo(sentenceId)`, and the popover stays open.
  - **Chat:** the input placeholder is "Ask about these sentences…". The context sent is every member sentence with its paragraph label.
  - **No Apply button.** Chat replies may still include a `<rewrite>` for one sentence. If they do, show Apply for the sentence the popover was opened from.
- **Dismiss** records one dismissal per member (`tool: "repetition"`, `kind: "repeat"`, `unitHash` = each member's hash), so the whole group disappears. If any member is later edited, its hash changes, and the group can reappear if it still passes the thresholds.

## Scheduling

This is a document-level tool, so it runs after `documentIdleMs`, and also once shortly after roles first finish for the document (it needs roles to choose candidates). When roles are switched off, repetition runs its own internal roles pass for candidate selection. Reuse the roles tool's request builder so its results hit the same cache.

## Assist panel

Adds the switch **Repetition** under "Markers". It is on by default.

## Config

```js
repetition: { enabled: true, thresholds: { pair: 0.5, minGroup: 3 }, generator: { provider: "anthropic", model: "claude-sonnet-5" } }
```

## Tests

- **Unit:**
  - Candidate filtering by role.
  - Option capping at 255.
  - Batching keeps the state the same across batches.
  - Union-find clustering: A~B and B~C give {A,B,C}; two separate pairs give two groups below `minGroup`, which are not flagged.
  - `groupId` stays stable when the order changes.
- **E2E, with Jev mocked:**
  - Three sentences in ¶2, ¶5 and ¶9 get end marks.
  - Clicking one lists all three full sentences with their paragraph labels.
  - Clicking a row scrolls to it.
  - Dismiss removes all three marks, and they stay gone after a reload.

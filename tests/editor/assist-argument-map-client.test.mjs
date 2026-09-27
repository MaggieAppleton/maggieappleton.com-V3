import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArgumentMapView } from "../../src/editor/assist/client/tools/argument-map.mjs";
import { Drawer, getDrawerViews } from "../../src/editor/assist/client/Drawer.mjs";

const map = {
 revision: "fixture", summary: { text: "The piece explores revision and an unresolved question.", sourceIds: ["p1", "p2"] },
 questions: [{ question: "Do readers return?", answer: "The draft does not establish this.", status: "open", sourceIds: ["p2"] }],
 moves: [{ title: "Revision and engagement", summary: "Revision helps ideas grow, but reader engagement is unresolved.", sourceIds: ["p1", "p2"],
  paragraphs: [{ blockId: "p1", summary: "Ideas develop through revision." }, { blockId: "p2", summary: "Engagement is still unknown." }] }],
 observations: [{ text: "The engagement question is introduced but not developed.", reason: "The ending leaves it unresolved.", sourceIds: ["p2"] }],
 sources: [{ blockId: "p1", number: 1, sentenceId: "s1" }, { blockId: "p2", number: 2, sentenceId: "s2" }],
};
const render = props => renderToStaticMarkup(React.createElement(ArgumentMapView, { map, ...props }));
test("outline exposes a whole-piece interpretation, questions and expandable moves without role inventory", () => {
 const html = render();
 assert.match(html, /The piece explores revision/); assert.match(html, /Do readers return/); assert.match(html, /Left open/);
 assert.match(html, /<details/); assert.match(html, /<summary/); assert.match(html, /Revision and engagement/);
 assert.match(html, /¶1–2/); assert.match(html, /Ideas develop through revision/);
 assert.doesNotMatch(html, /role-strip|No supporting evidence|Off-thread:/);
});
test("source controls follow current block identities and disable removed passages", () => {
 const html = render({ currentBlocks: [{ id: "p1", kind: "paragraph", sentences: [{ id: "new-s1" }] }] });
 assert.match(html, /data-sentence-id="new-s1"/); assert.doesNotMatch(html, /data-sentence-id="s1"/);
 assert.match(html, /disabled=""[^>]*>¶2/);
});
test("rejected summaries remain navigable placeholders, not accepted prose", () => {
 const changed = structuredClone(map); changed.summary.text = null; changed.summary.unavailable = true;
 changed.moves[0].title = "Summary unavailable"; changed.moves[0].summary = null; changed.moves[0].unavailable = true;
 changed.moves[0].paragraphs[1].summary = null; changed.moves[0].paragraphs[1].unavailable = true;
 const html = render({ map: changed }); assert.match(html, /Summary unavailable/); assert.match(html, /¶2/);
 assert.doesNotMatch(html, /Engagement is still unknown/);
});
test("refresh and stale states retain the outline alongside update errors", () => {
 const html = render({ stale: true, loading: true, error: "Could not update" });
 assert.match(html, /Out of date/); assert.match(html, /Updating/); assert.match(html, /Could not update/);
 assert.match(html, /Revision and engagement/);
 const retry = render({ map: null, error: "Needs a provider" }); assert.match(retry, /Retry/);
});
test("one-move drafts render, empty drafts have an empty state, initial generation has a skeleton", () => {
 assert.match(render(), /Revision and engagement/);
 assert.match(render({ map: { ...map, moves: [] } }), /Nothing to outline yet/);
 assert.match(render({ map: null, loading: true }), /Loading reverse outline/);
});
test("the drawer offers only the reverse outline and does not restore a Flow view", () => {
 const html = renderToStaticMarkup(React.createElement(Drawer, { open: true, map }));
 assert.match(html, /Revision and engagement/); assert.doesNotMatch(html, />Flow<|>Structure</);
 assert.equal(getDrawerViews().filter(v => v.id === "flow").length, 0);
});

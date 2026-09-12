# Responsibility fingerprints prototype

Approved direction: the user chose fingerprints on 7 September 2026. Build this one concept as a reversible, local experiment. No further design approval is needed to try it.

Question: does an individual pattern of 21 responsibilities remain legible and revealing when expanded to all 3,000 parents?

## Implementation

- [x] Add a development-only Astro route at `/prototypes/mental-load`, with the site's layout and typography. Use a new route because the working essay is actively being edited; the prototype should not alter its prose. Do not add the other visual concepts or an unrelated variant switcher.
- [x] Add `src/components/unique/mental-load/FingerprintsPrototype.astro` for the interface and `fingerprints-prototype.css` for namespaced visual styles. Mount a labelled 7-domain × 3-task fingerprint, then a population view with two canvas panels and clearly different sample sizes.
- [x] Add `fingerprints-prototype.js` for reading the existing JSON data, rendering marks, filtering Daily/Episodic/All, sorting real records, zooming, selecting a respondent, and opening an accessible answer dialog. Preserve task positions across scope changes. Never synthesise people or pair mothers with fathers.
- [x] Use keyboard navigation within each population canvas, readable answer lists, a persistent response key, and reduced-motion support. Reinitialise safely after Astro navigation and clean up animation/listener state.
- [x] Exercise the route in a real browser: initial fingerprint, group switch, scope filters, population counts, sorting, zoom, pointer and keyboard selection, dialog dismissal, narrow viewport and navigation away/back. Check browser errors and horizontal overflow.

## Encoding

Seven columns are cleaning, scheduling, childcare, social relationships, food, maintenance and finances; three rows are the three tasks in each domain. The first five columns form Daily, the last two Episodic. Filled circle = mostly me; half circle = equally shared; empty circle = mostly partner; small grey dot = someone else; cross = not applicable. Inactive domains fade without changing geometry. Colour identifies respondent group, not a complementary share.

Population sorting uses the number of active tasks answered mostly me, with source ordinal as deterministic tie-breaker. Headline averages use each person's fraction of applicable active tasks and exclude zero denominators. All records remain present. The source file is the vetted `respondents.json`, and labels come from `published-data.json`; do not expose the unrelated work/household indicators in this first prototype.

## Verdict

The user judged the trial too focused on individual parents and too difficult to read at population scale. Replaced on the local route by the [aggregate-map trial](aggregate-maps-prototype-plan.md). Fingerprint files remain unmounted for recoverability; do not reintroduce individual browsing as the primary experience.

## Verification — 7 September 2026

Running locally at <http://localhost:4322/prototypes/mental-load> on the existing development server. The draft was not edited.

An isolated Chrome run through Playwright passed initial-record and 21-task assertions; all/daily/episodic means; sorting; pointer selection checked against the source record; the full answer dialog and next-parent control; Escape; zoom; keyboard End/Enter; Astro navigation away/back; desktop and 390px viewport overflow checks; and reduced-motion interaction. No browser errors were recorded. Desktop, mobile and the settled dialog were visually inspected. `node --check` and `git diff --check` passed. No production build was run; the route returns no static paths outside development.

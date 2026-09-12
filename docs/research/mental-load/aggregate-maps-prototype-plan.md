# Aggregate responsibility maps — prototype plan

Approved on 7 September 2026 after the fingerprint trial: prioritise synthesis and high-level trends, not individual survey records. One chosen direction, not a gallery of variants. Implement inline in this existing local experiment; do not edit the working essay or commit unrelated work.

**Question:** Can a reader see the daily/episodic gender pattern before interacting?

**Architecture:** Server-render two matching seven-domain maps using actual aggregate calculations. Send only aggregate values to the client. Domain selection highlights both matching tiles and reveals a three-task comparison below the maps. Keep the earlier fingerprint files unmounted so the experiment remains recoverable.

**Stack:** Astro, plain JavaScript, namespaced CSS; existing development-only `/prototypes/mental-load` route.

## Encoding and calculations

Each tile is an equally sized rectangular 0–100% area, filled from the bottom. Tile position and dimensions match across respondent groups. Five daily domains come first (cleaning, scheduling, childcare, relationships, food); maintenance and finances follow as episodic domains. Tile area does not represent hours, frequency or effort. Colour identifies the respondent group; the values are independent reports, not complementary household shares.

For every domain and daily/episodic summary, compute the fraction of applicable tasks marked mostly me for each respondent, then average over respondents with at least one applicable task. For a single-task detail this is the fraction of applicable respondents marking mostly me. Exclude not-applicable responses from the denominator, not shared or someone-else responses. These domain and task-detail values are recalculations, not copies of the original paper's all-respondent task percentages. Retain denominators and explain the difference in the source disclosure.

## Implementation and checks

- [x] Add `src/components/unique/mental-load/responsibility-map-data.js`: pure aggregation with fixed domain ordering; return daily/episodic summaries, domain means, three task means per domain, contributing Ns and group totals. Check against the existing survey-derived daily/episodic means and a hand-calculated fixture with not-applicable responses.
- [x] Add `ResponsibilityMapsPrototype.astro` and `responsibility-maps-prototype.css`: readable server-rendered domain maps, prominent daily/episodic summaries, short scale explanation, progressively disclosed task comparison and methodology. Keep mothers and fathers side by side on mobile. Main data remains readable with JavaScript disabled.
- [x] Add `responsibility-maps-prototype.js`: paired hover/focus/selection, domain detail open/change/close, shareable domain query, native keyboard activation, reduced-motion-aware transitions and Astro navigation cleanup. No respondent inspector, sort or zoom.
- [x] Switch `src/pages/prototypes/[prototype].astro` to the new component, revise the introduction and retain the development-only route guard. Do not change the draft.
- [x] Check the rendered values against raw records, all seven domain controls, three-task details, closing/refocusing, reloadable selection, keyboard interaction, navigation away/back, no-JS reading, reduced motion, 1440/768/390/320px layouts and browser errors. Inspect desktop/mobile screenshots. Run JS syntax and whitespace checks. No full publication build needed for this throwaway route.

## Verdict

Awaiting the user's response to the runnable aggregate-map trial. The fingerprint trial was judged too focused on individuals and too difficult to read at population scale; do not reintroduce that as the primary display.

## Verification — 7 September 2026

Running on the existing server at <http://localhost:4322/prototypes/mental-load>. An isolated Chrome/Playwright check completed all assertions with no browser errors: independent raw-data calculations for all domain and task values, archived daily/episodic means and Ns, zero-denominator fixtures, 14 displayed tile values and proportional fill heights, absence of individual records from the payload, paired hover, seven domain selections, all 21 task comparisons, Enter/Escape and focus restoration, URL reload, close control, Astro navigation, 1440/768/390/320px overflow, side-by-side group layout, reduced motion and a no-JavaScript overview. Desktop, mobile and expanded task screenshots were visually inspected. Both new JavaScript files passed `node --check`; `git diff --check` passed. No production build was run.

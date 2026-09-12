# Household sampler — prototype plan

Approved direction: the user chose the household sampler on 7 September 2026. Implement this single trial on the existing development-only route, not a new gallery. Preserve the draft and the unmounted earlier experiments. No commit or publication requested.

**Question:** Does a textile-like graphic communicate the aggregate pattern with less visible text and fewer numbers, while keeping all seven domains and the selected domain's three tasks on screen together?

**Design:** Two matching cross-stitch samplers sit beside a permanently visible task panel. All seven domains remain in fixed positions; scheduling starts selected. A small household drawing identifies each domain. Every quantitative motif uses the same 100 stitch positions. Coloured stitches represent the rounded percentage of responsibility; decorative icons do not carry values. The first five domains are daily, the last two episodic. Mothers and fathers remain independent group reports. Reuse the checked applicable-task calculations from `responsibility-map-data.js`.

Exact rounded percentages, contributing Ns and full survey wording are available through hover, keyboard focus or tap. A reserved readout area contains that detail without expanding the page. A selected domain remains highlighted in both samplers. Selection updates three task rows in place, with no automatic scrolling or focus transfer. On narrow screens the overview becomes two compact horizontal sampler rows above the three-task panel; no category disappears behind a tab or carousel.

## Implementation

- [ ] Add `sampler-art.js`: deterministic 100-stitch rosette geometry, whole-percent colouring, seven decorative household motifs, and SVG rendering shared by server and client. No individual records or random point clouds.
- [ ] Add `HouseholdSamplerPrototype.astro`: server-rendered paired samplers, daily/episodic inspection controls, default scheduling task panel, reserved numerical readout, accessible names and a collapsed data note. Send only aggregate data to the client.
- [ ] Add `household-sampler-prototype.css`: linen/screen-print art direction, stitched outlines, burgundy and blue-green thread, compact desktop composition and responsive two-row overview. Keep numbers secondary. No giant percentages, bars, modal dialogs or scroll-to-detail behavior.
- [ ] Add `household-sampler-prototype.js`: in-place domain switching, paired highlight, hover/focus/tap readouts, shareable domain query, short interruptible detail transitions, reduced motion and Astro navigation cleanup.
- [ ] Mount the sampler in `src/pages/prototypes/[prototype].astro`; shorten this experiment's introduction so the graphic fits the screen. Retain development-only routing and do not edit the essay.
- [ ] Verify 100 positions and correct coloured counts; all 14 aggregate and 42 task percentages; all seven selections; fixed overview/detail geometry and unchanged scroll position; hover/focus/tap access; keyboard operation; URL reload; Astro navigation; no-JS default view; reduced motion; overflow and simultaneous overview/detail visibility at desktop and mobile viewports. Visually inspect screenshots and check JavaScript syntax/whitespace.

## Verdict

Awaiting the user's response to the runnable sampler. The aggregate-map trial improved synthesis but its bars, dominant numbers and below-the-fold drill-down were rejected. Keep its statistical calculations, not its layout.

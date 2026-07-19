// Canvas controller for the poppy field. One rAF loop stamps pre-rendered
// sprites at each poppy's home + a wind offset plus a scroll-driven lift
// (scrolling down pushes poppies up, scrolling up settles them back). Year/
// battle labels carve an elliptical "clearing" out of the poppies around them
// (see computeClearZones/inClearZone).
//
// The canvas is a viewport-sized *window* onto the field, not the full field:
// the stage is ~6,500 CSS px tall, and a canvas that size blows straight past
// mobile canvas limits (iOS Safari blanks canvases taller than ~8,192 device
// px) and costs ~40MB of backing store. Instead a pair of window-sized
// canvases alternate along the stage as you scroll — see jumpTo for why jumps
// are double-buffered — each painting in stage coordinates offset by its own
// window position.

import {
	computePoppyHomes,
	totalHeight,
	monthIndexForY,
	yForMonthIndex,
	maxHalfWidth,
	effMonthH,
	type Poppy,
} from "./layout";
import { bakePoppyAngleSpriteSets, oklchToHex, type AngleSprites } from "./poppy-3d-sprites";
import { MONTHLY, BATTLES, monthLabel } from "./wwi-monthly-deaths";
import {
	SPRITE_BASE,
	HOVER_SPINE_PX,
	POPPY_UNIT,
	EDGE_MARGIN,
	EDGE_MARGIN_MOBILE,
	MOBILE_BREAKPOINT,
	MOBILE_THIN,
	MOBILE_HEIGHT_SCALE,
	SPRITE_CELL_MOBILE,
	POPPY_LEAN,
	POPPY_LEAN_VAR,
} from "./constants";
import { DEFAULTS, type FieldParams } from "./params";

// The baked poppy doesn't fill its whole sprite cell (there's transparent
// padding around the flower), so draw it a bit larger than the old flat sprite
// to match the intended on-page size.
const SPRITE_DRAW_SCALE = 1.7;

const LIFT_PX = 42; // max rise/fall (px) at full scroll speed, scaled per-poppy by rScale

// The painted band extends this far past the viewport top/bottom so sprite
// overhang and scroll-lift never draw outside it…
const WINDOW_PAD = SPRITE_BASE * 2 + LIFT_PX;
// …and the window is this much taller still. The slack means the window only
// has to jump to a new position every few hundred scrolled px — between jumps
// its transform is constant, so scrolling never invalidates the canvas layer
// and per-frame painting stays limited to the small viewport band. It also
// absorbs mobile URL-bar show/hide (which changes innerHeight without an
// immediate resize event).
const WINDOW_SLACK = 600;

interface ClearZone {
	zx: number;
	zy: number;
	rx: number;
	ry: number;
	yTop: number;
	yBot: number;
}

export function initPoppyField(root: HTMLElement): (() => void) | void {
	const canvas = root.querySelector<HTMLCanvasElement>("canvas.poppy-field__canvas");
	const stage = root.querySelector<HTMLElement>(".poppy-field__stage");
	const tip = root.querySelector<HTMLElement>(".poppy-field__tip");
	const tipMonth = tip?.querySelector<HTMLElement>(".poppy-field__tip-month");
	const tipCount = tip?.querySelector<HTMLElement>(".poppy-field__tip-count");
	if (!canvas || !stage || !tip || !tipMonth || !tipCount) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	// Second window buffer for jumps (see jumpTo): WebKit commits a canvas's
	// style position and its freshly painted bitmap in different frames, so
	// moving+repainting one canvas flashes the old bitmap at the new position
	// on iOS. Jumps paint the hidden spare instead and reveal it once the
	// bitmap has certainly committed. cloneNode carries the class and Astro's
	// scoping attribute, so the stylesheet applies identically.
	const canvasB = canvas.cloneNode() as HTMLCanvasElement;
	canvasB.style.visibility = "hidden";
	canvas.after(canvasB);
	const ctxB = canvasB.getContext("2d");
	if (!ctxB) {
		canvasB.remove();
		return;
	}

	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	// The muted sprite set only exists for the desktop battle-label hover
	// crossfade — touch devices skip baking it, halving their bake cost.
	const hoverCapable = window.matchMedia("(hover: hover)").matches;
	// Phones get a de-cluttered variant: fewer poppies over taller rows, no width
	// cap. Recomputed in geometry() so a resize across the breakpoint re-lays-out.
	const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;
	const currentParams = (): FieldParams =>
		isMobile()
			? { ...DEFAULTS, heightScale: MOBILE_HEIGHT_SCALE, thin: MOBILE_THIN }
			: { ...DEFAULTS };
	let params: FieldParams = currentParams();

	let W = 0;
	let dpr = 1;
	let H = totalHeight(params);
	let xScale = 1;
	let sprites: AngleSprites = { combat: [], disease: [], angles: [] };
	// Duller, lighter twin of `sprites` so hovering a battle can fade the rest of
	// the field into the background without touching size or opacity.
	let mutedSprites: AngleSprites = { combat: [], disease: [], angles: [] };
	let homes: Poppy[] = [];
	let angleIdx: Int16Array = new Int16Array(0); // baked-sprite index per poppy (its facing)
	let clearZones: ClearZone[] = [];
	let gust = 0;
	let gustEase = 0; // eased so a scroll's extra sway ramps in/out instead of snapping
	// Signed scroll speed (+ down, − up) driving directional lift — separate from
	// gust's unsigned energy, which only ever adds to sway amplitude.
	let scrollLift = 0;
	let scrollLiftEase = 0;
	let hoverBattle: string | null = null;
	let hoverT = 0; // eases 0→1 toward hoverBattle so grow/mute settle in rather than snap
	let winH = 0; // CSS px height of the windowed canvas
	let winY = 0; // the visible window's offset from the top of the stage (CSS px)
	// Which buffer is on screen (owns winY) vs. waiting for the next jump.
	let front = { canvas, ctx };
	let back = { canvas: canvasB, ctx: ctxB };
	// A jump in flight: the back buffer has been painted and positioned, and is
	// waiting out the reveal delay. The token ties each deferred reveal to the
	// jump that scheduled it, so a stale chain can't complete a newer jump.
	let pending: { target: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }; winY: number; token: number } | null =
		null;
	let swapToken = 0;
	let swapRaf = 0;

	function buildSprites() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		const cell = isMobile() ? SPRITE_CELL_MOBILE : undefined;
		const full = {
			combat: oklchToHex(params.combatL, params.combatC, params.combatH),
			disease: oklchToHex(params.diseaseL, params.diseaseC, params.diseaseH),
		};
		const muted = {
			combat: oklchToHex(Math.min(1, params.combatL + 0.2), params.combatC * 0.15, params.combatH),
			disease: oklchToHex(Math.min(1, params.diseaseL + 0.2), params.diseaseC * 0.15, params.diseaseH),
		};
		const sets = bakePoppyAngleSpriteSets(dpr, { cell }, hoverCapable ? [full, muted] : [full]);
		sprites = sets[0];
		mutedSprites = sets[1] ?? { combat: [], disease: [], angles: sprites.angles };
		renderLegend();
	}

	// Legend swatches use the same baked sprites as the field itself (straight-on
	// facing, unmuted) so they match the rendered flowers' shape/colour/lighting
	// exactly rather than approximating them separately.
	function renderLegend() {
		const straightOn = Math.floor(sprites.angles.length / 2);
		root.querySelectorAll<HTMLCanvasElement>(".poppy-field__legend-poppy").forEach((cv) => {
			const group = cv.dataset.cause === "disease" ? sprites.disease : sprites.combat;
			const spr = group[straightOn] ?? group[0];
			const ctx2d = cv.getContext("2d");
			if (!spr || !ctx2d) return;
			const size = Math.max(1, Math.round((cv.clientWidth || 30) * dpr));
			if (cv.width !== size) {
				cv.width = size;
				cv.height = size;
			}
			ctx2d.clearRect(0, 0, size, size);
			ctx2d.drawImage(spr, 0, 0, size, size);
		});
	}

	function geometry() {
		params = currentParams();
		const mobile = isMobile();
		H = totalHeight(params);
		homes = computePoppyHomes(params, 3).sort((a, b) => a.rScale - b.rScale);
		stage!.style.height = `${H}px`;
		// On mobile the figure already breaks out past the screen edges, so let the
		// stage fill that full breakout width; on desktop keep the centred cap.
		stage!.style.maxWidth = mobile ? "none" : `${params.maxWidth}px`;
		W = canvas!.clientWidth; // reflects the capped stage width
		winH = Math.min(H, window.innerHeight + WINDOW_PAD * 2 + WINDOW_SLACK);
		for (const cv of [canvas!, canvasB]) {
			cv.style.height = `${winH}px`;
			cv.width = Math.round(W * dpr);
			cv.height = Math.round(winH * dpr);
		}
		// Resizing wiped both backings — abandon any half-done jump and make sure
		// the front buffer is the one showing (a pending reveal would swap to a
		// now-blank canvas).
		pending = null;
		front.canvas.style.visibility = "visible";
		back.canvas.style.visibility = "hidden";
		// No min(1) clamp → widest month scales up to fill wide canvases too, so the
		// field always spans (canvas width − edge margins).
		xScale = (W / 2 - (mobile ? EDGE_MARGIN_MOBILE : EDGE_MARGIN)) / maxHalfWidth(params);
		assignFacings();
		positionLabels();
		computeClearZones();
	}

	// Picks each poppy's baked yaw sprite from its offset from the spine, so the
	// field leans outward in unison with a little per-poppy jitter.
	function assignFacings() {
		const nAng = sprites.combat.length;
		angleIdx = new Int16Array(homes.length);
		if (!nAng) return;
		const maxHalf = maxHalfWidth(params) || 1;
		const a0 = sprites.angles[0];
		const a1 = sprites.angles[nAng - 1];
		const span = a1 - a0 || 1;
		for (let i = 0; i < homes.length; i++) {
			const p = homes[i];
			const nx = Math.max(-1, Math.min(1, p.x / maxHalf));
			const yaw = nx * POPPY_LEAN + (p.rScale - 0.5) * 2 * POPPY_LEAN_VAR;
			angleIdx[i] = Math.max(0, Math.min(nAng - 1, Math.round(((yaw - a0) / span) * (nAng - 1))));
		}
	}

	function positionLabels() {
		root.querySelectorAll<HTMLElement>("[data-mindex]").forEach((el) => {
			el.style.top = `${yForMonthIndex(parseFloat(el.dataset.mindex!), params)}px`;
		});
	}

	// Builds each label's elliptical clearing zone from its laid-out box
	// (offsetLeft/Top/Width/Height — stage-relative, unlike getBoundingClientRect).
	function computeClearZones() {
		const mobile = isMobile(); // slightly taller clearings — rows read denser on a narrow screen
		const ryMul = mobile ? 2.0 : 1.8;
		const ryPad = mobile ? 16 : 16;
		const zones: ClearZone[] = [];
		root.querySelectorAll<HTMLElement>(".poppy-field__year, .poppy-field__battle").forEach((el) => {
			const w = el.offsetWidth;
			const h = el.offsetHeight;
			const top = el.offsetTop;
			const left = el.offsetLeft;
			// Years are right-anchored + centred (translate(-100%,-50%)); battles are
			// left-anchored + only vertically centred (translateY(-50%)).
			const zx = el.classList.contains("poppy-field__year") ? left - w / 2 : left + w / 2;
			const zy = top;
			const rx = (w / 2) * 1.3 + 16; // generous vs the label's own box — hard cutoff, no feather
			const ry = (h / 2) * ryMul + ryPad;
			zones.push({ zx, zy, rx, ry, yTop: zy - ry, yBot: zy + ry });
		});
		clearZones = zones;
	}

	// Tested against each poppy's stable home position, not its wind/lift-perturbed
	// draw position, so boundary poppies don't flicker as they sway.
	function inClearZone(x: number, y: number): boolean {
		for (let i = 0; i < clearZones.length; i++) {
			const z = clearZones[i];
			if (y < z.yTop || y > z.yBot) continue; // cheap reject before the ellipse math
			const nx = (x - z.zx) / z.rx;
			const ny = (y - z.zy) / z.ry;
			if (nx * nx + ny * ny < 1) return true;
		}
		return false;
	}

	function inBattle(y: number, id: string) {
		const b = BATTLES.find((x) => x.id === id);
		if (!b) return false;
		const half = effMonthH(params) / 2;
		const lo = yForMonthIndex(b.startIndex, params) - half;
		// A battle ending on the last month also claims the lead-out poppies past it.
		const hi = b.endIndex === MONTHLY.length - 1 ? Infinity : yForMonthIndex(b.endIndex, params) + half;
		return y >= lo && y <= hi;
	}

	// Paints the stage band [vTop, vBot] into buffer `g`, which is (or will be)
	// positioned at stage offset wY and must cover the band. All coordinates
	// are stage-space; the per-poppy setTransform folds in both dpr and the
	// -wY window offset.
	function paint(g: CanvasRenderingContext2D, wY: number, vTop: number, vBot: number, t: number) {
		const cx = W / 2;
		const amp = (reduce ? 0 : 0.26) + gustEase;
		const lift = reduce ? 0 : scrollLiftEase * LIFT_PX; // signed: down lifts, up settles
		const sizeAmp = 0.4 * params.sizeVariance;
		g.setTransform(dpr, 0, 0, dpr, 0, -wY * dpr);
		g.clearRect(0, vTop, W, vBot - vTop);
		for (let i = 0; i < homes.length; i++) {
			const p = homes[i];
			if (p.y < vTop || p.y > vBot) continue;
			const homeX = cx + p.x * xScale;
			if (clearZones.length && inClearZone(homeX, p.y)) continue;
			const wind = reduce
				? 0
				: Math.sin(p.y * 0.015 + t * 0.0012 + p.phase) * amp +
					Math.sin(p.x * 0.01 + t * 0.0009) * amp * 0.5;
			const hl = hoverBattle ? inBattle(p.y, hoverBattle) : false;
			const scale = 1 + (p.rScale - 0.5) * 2 * sizeAmp; // variance 0 → all 1.0
			const depthAlpha = Math.max(0, Math.min(1, 0.55 + (scale - 0.7) * 0.5));
			const baseAlpha = 1 + (depthAlpha - 1) * params.opacityVariance; // variance 0 → opaque
			// Battle poppies grow and brighten toward full size/opacity as hoverT rises;
			// the rest of the field shrinks slightly to recede behind them.
			const sizeMul = hl ? 1 + 0.28 * hoverT : 1 - 0.1 * hoverT;
			const alpha = hl ? baseAlpha + (1 - baseAlpha) * hoverT : baseAlpha;
			const size = SPRITE_BASE * SPRITE_DRAW_SCALE * params.baseSize * scale * sizeMul;
			const group = p.cause ? sprites.disease : sprites.combat;
			const spr = group[angleIdx[i]] ?? group[0];
			if (!spr) continue;
			// Bigger/closer poppies catch more lift, reading as depth rather than a
			// uniform shove.
			const poppyLift = lift * (0.5 + p.rScale * 0.9);
			const driftX = Math.sin(p.phase * 1.6) * lift * 0.3;
			// gentle stem sway only — a full rotation would spin the baked top-light.
			// tiltEase fades the tilt out at quality level ≥1 rather than snapping —
			// an axis-aligned drawImage takes a fast blit path that a rotated one
			// can't (the single biggest per-frame raster cost, 3-4x in profiling),
			// but a whole-field pose snap reads as a flicker, so the transition has
			// to be gradual. The translation part of the sway always remains.
			const rot = tiltEase < 0.01 ? 0 : wind * 0.4 * tiltEase;
			const cos = rot === 0 ? dpr : Math.cos(rot) * dpr;
			const sin = rot === 0 ? 0 : Math.sin(rot) * dpr;
			const tx = (homeX + wind * 7 + driftX) * dpr;
			const ty = (p.y - poppyLift - wY) * dpr;
			// One setTransform per poppy instead of save/translate/rotate/restore —
			// the same matrix, without the state-stack churn.
			g.setTransform(cos, sin, -sin, cos, tx, ty);
			const mutedGroup = p.cause ? mutedSprites.disease : mutedSprites.combat;
			const mutedSpr = !hl && hoverT > 0.001 ? (mutedGroup[angleIdx[i]] ?? mutedGroup[0]) : undefined;
			if (mutedSpr) {
				// Crossfade toward the muted, low-chroma twin as a battle comes into focus.
				if (hoverT < 0.999) {
					g.globalAlpha = alpha;
					g.drawImage(spr, -size / 2, -size / 2, size, size);
				}
				g.globalAlpha = alpha * hoverT;
				g.drawImage(mutedSpr, -size / 2, -size / 2, size, size);
			} else {
				g.globalAlpha = alpha;
				g.drawImage(spr, -size / 2, -size / 2, size, size);
			}
		}
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.globalAlpha = 1;
	}

	// Moves the window to a new position re-centred on the viewport, by way of
	// the hidden back buffer: paint it fully at the new offset, position it
	// (`top`, not a transform — a transform would push the canvas onto the
	// composited-layer path where rasterisers stop tracking canvas dirty
	// rects), then reveal it two frames later, hiding the old buffer in the
	// same commit. WebKit applies a canvas's style position and its freshly
	// painted bitmap in different frames, so moving+repainting a *visible*
	// canvas flashes its old bitmap at the new position on iOS — the whole
	// field displaced for a frame on every jump. The front buffer stays
	// correct and on screen throughout (everything is stage-anchored), and by
	// reveal time the back buffer's bitmap has certainly committed.
	function completeSwap(p: NonNullable<typeof pending>) {
		p.target.canvas.style.visibility = "visible";
		front.canvas.style.visibility = "hidden";
		back = front;
		front = p.target;
		winY = p.winY;
		pending = null;
	}

	function jumpTo(newWinY: number, t: number) {
		const target = back;
		paint(target.ctx, newWinY, newWinY, Math.min(H, newWinY + winH), t);
		target.canvas.style.top = `${newWinY}px`;
		const token = ++swapToken;
		pending = { target, winY: newWinY, token };
		swapRaf = requestAnimationFrame(() => {
			swapRaf = requestAnimationFrame(() => {
				if (disposed || !pending || pending.token !== token) return;
				completeSwap(pending);
			});
		});
	}

	// Paint pass for one frame: start a window jump if the viewport's band has
	// drifted outside the current window (the slack gives a few hundred px of
	// scroll between jumps), then repaint the viewport band of the front
	// buffer, mirroring the pre-window renderer's dirty region.
	//
	// The stage's viewport offset is measured fresh every pass, NOT cached and
	// derived from scrollY: anything that shifts the page without a scroll event
	// (view-transition swaps, scroll anchoring while images above load in, font
	// reflow) silently invalidates a cached offset and strands the window in
	// the wrong place — which shows up as a blank band chasing the viewport.
	// One getBoundingClientRect per painted frame is the same read the
	// pre-windowed renderer did on every scroll event.
	function renderWindow(t: number) {
		const canvasTop = stage!.getBoundingClientRect().top;
		const vh = window.innerHeight;
		const bandTop = Math.max(0, -canvasTop - WINDOW_PAD);
		const bandBot = Math.min(H, -canvasTop + vh + WINDOW_PAD);
		// If scrolling has fully outrun the front window it's showing nothing —
		// the reveal delay is pointless (blank beats a maybe-flash), so promote
		// the in-flight jump immediately; its bitmap is at least a frame old.
		if (pending && Math.min(winY + winH, bandBot) <= Math.max(winY, bandTop)) completeSwap(pending);
		if (!pending && !(bandTop >= winY && bandBot <= winY + winH)) {
			// Bias the new window centre in the scroll direction (scrollLift is the
			// signed scroll-speed signal, ±0.9 at full speed) so it lands where the
			// viewport is heading — by the time the swap completes, a fast scroll
			// has moved on from where the jump was computed. Capped below the
			// window's slack margin minus WINDOW_PAD (394−94) so the biased window
			// still covers the viewport band it was jumped for.
			const lead = Math.max(-250, Math.min(250, scrollLift * 400));
			jumpTo(Math.round(Math.max(0, Math.min(H - winH, -canvasTop - (winH - vh) / 2 + lead))), t);
		}
		// Keep animating the on-screen buffer while any jump is still in flight —
		// clamped to its window, which still covers the viewport (jumps trigger
		// with WINDOW_PAD of margin to spare).
		const vTop = Math.max(winY, bandTop);
		const vBot = Math.min(winY + winH, bandBot);
		if (vBot > vTop) paint(front.ctx, winY, vTop, vBot, t);
	}

	function renderStatic() {
		renderWindow(0);
	}

	// Adaptive degradation for weak devices, keyed off real frame cadence (which
	// includes raster/compositing cost — JS-side paint timing alone misses the
	// dominant native work). Levels: 0 = full effect; 1 = no sway tilt (rotated
	// drawImage defeats the rasteriser's fast blit path and is the single
	// biggest frame cost); 2/3 = also paint every 2nd/3rd frame. Poppies are
	// painted at stage coordinates, so skipped frames only slow the wind —
	// scroll motion stays native-smooth via the browser's compositor.
	//
	// Transitions must be invisible: the tilt fades via tiltEase rather than
	// snapping (a whole-field pose snap reads as flicker), demotion needs
	// *sustained* slow frames (a one-off spike from a window jump or GC doesn't
	// count), and after any level change the ladder holds still for a while so
	// scroll-burst load can't make it oscillate.
	let quality = 0;
	let tiltEase = 1; // 1 = full sway tilt, eases toward 0 at quality ≥ 1
	let deltaEMA = 1000 / 60;
	let slowFrames = 0;
	let lastChangeT = 0;
	let lastFrameT = 0;
	let frameCount = 0;
	const PAINT_EVERY = [1, 1, 2, 3];

	function frame(t: number) {
		// Frame-time factor: 1 at 60Hz, 0.5 at 120Hz. All easings/decays are
		// exponentiated by it so wind physics behave identically on ProMotion
		// phones and 60Hz screens instead of running twice as fast/snappy.
		let k = 1;
		if (lastFrameT) {
			const delta = Math.min(t - lastFrameT, 250); // clamp tab-switch gaps
			k = Math.max(0.25, Math.min(4, delta / (1000 / 60)));
			deltaEMA += (delta - deltaEMA) * 0.08;
			// Catastrophic frames count 4x so a device that can't manage even a few
			// fps escapes to a cheaper level in a handful of frames, while ordinary
			// jank still needs to be sustained before it demotes anything.
			slowFrames = delta > 40 ? slowFrames + (delta > 150 ? 4 : 1) : Math.max(0, slowFrames - 2);
			if (slowFrames > 12 && quality < 3 && t - lastChangeT > 1500) {
				quality++;
				slowFrames = 0;
				lastChangeT = t;
			} else if (deltaEMA < 20 && quality > 0 && t - lastChangeT > 8000) {
				quality--;
				lastChangeT = t;
			}
		}
		lastFrameT = t;
		const decay = Math.pow(0.95, k);
		const easeIn = 1 - decay; // == 0.05 at 60Hz, rate-matched elsewhere
		// Eased rather than read directly, giving the scroll-driven sway/lift its lag.
		gustEase += (gust - gustEase) * easeIn;
		scrollLiftEase += (scrollLift - scrollLiftEase) * easeIn;
		hoverT += ((hoverBattle ? 1 : 0) - hoverT) * (1 - Math.pow(0.88, k));
		tiltEase += ((quality >= 1 ? 0 : 1) - tiltEase) * (1 - Math.pow(0.96, k));
		frameCount++;
		if (frameCount % PAINT_EVERY[quality] === 0) renderWindow(t);
		gust *= decay;
		scrollLift *= decay;
		raf = requestAnimationFrame(frame);
	}

	// Reduced-motion mode has no rAF loop, but the windowed canvas still needs
	// repainting as it tracks the scroll position — coalesced to one per frame.
	let staticRaf = 0;
	const scheduleStatic = () => {
		if (staticRaf || !baked) return;
		staticRaf = requestAnimationFrame(() => {
			staticRaf = 0;
			renderStatic();
		});
	};

	let lastY = window.scrollY;
	const onScroll = () => {
		const dy = window.scrollY - lastY; // + scrolling down, − scrolling up
		lastY = window.scrollY;
		if (reduce) {
			scheduleStatic();
		} else {
			gust = Math.min(0.9, gust + Math.abs(dy) * 0.002);
			scrollLift = Math.max(-0.9, Math.min(0.9, scrollLift + dy * 0.002));
		}
	};
	window.addEventListener("scroll", onScroll, { passive: true });

	// On the stage rather than the canvas: the windowed canvas only covers part
	// of the stage, and the stage's box is what the tip is positioned within.
	const onStagePointerMove = (e: PointerEvent) => {
		// Touch "moves" are scroll gestures — showing the month readout under a
		// scrolling thumb just flashes a box mid-scroll.
		if (e.pointerType === "touch") return;
		const r = stage.getBoundingClientRect();
		const x = e.clientX - r.left;
		const y = e.clientY - r.top;
		if (Math.abs(x - W / 2) < HOVER_SPINE_PX) {
			const m = MONTHLY[monthIndexForY(y, params)];
			tipMonth.textContent = monthLabel(m);
			tipCount.textContent = `${(m.deaths * POPPY_UNIT).toLocaleString()} dead`;
			tip.style.transform = `translate(${x}px, ${y}px)`;
			tip.dataset.show = "1";
		} else {
			tip.dataset.show = "0";
		}
	};
	const onStagePointerLeave = () => {
		tip.dataset.show = "0";
	};
	stage.addEventListener("pointermove", onStagePointerMove);
	stage.addEventListener("pointerleave", onStagePointerLeave);

	function setHoverBattle(id: string | null) {
		hoverBattle = id;
		if (reduce) {
			// No animated loop is running to ease hoverT — snap straight to the target.
			hoverT = hoverBattle ? 1 : 0;
			renderStatic();
		}
	}

	const battleLabelHandlers: Array<{
		el: HTMLElement;
		onEnter: () => void;
		onLeave: () => void;
	}> = [];
	// Hover-capable pointers only: on touch screens, a scroll that happens to
	// start on a battle label fires pointerenter → the whole field pulses
	// (battle poppies grow, the rest shrink) mid-scroll, reading as flicker.
	// There's no meaningful hover on touch anyway (and no muted sprite set).
	if (hoverCapable) {
		root.querySelectorAll<HTMLElement>("[data-battle]").forEach((el) => {
			const onEnter = () => setHoverBattle(el.dataset.battle ?? null);
			const onLeave = () => setHoverBattle(null);
			el.addEventListener("pointerenter", onEnter);
			el.addEventListener("pointerleave", onLeave);
			battleLabelHandlers.push({ el, onEnter, onLeave });
		});
	}

	let raf = 0;
	let resizeTimer = 0;
	const onResize = () => {
		window.clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(() => {
			// Rebaking sprites means spinning up a full Three.js scene — only
			// worth it if the device pixel ratio actually changed (e.g. dragging
			// the window to a different-DPR display); a plain width change just
			// needs new geometry.
			if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) buildSprites();
			geometry();
			if (reduce) scheduleStatic();
		}, 150);
	};
	window.addEventListener("resize", onResize);

	// The sprite bake is tens of ms of main-thread jank, so it runs off the
	// critical path: ideally during idle time shortly after init (long before
	// the reader scrolls this far down), else synchronously when the field
	// approaches the viewport (see the observer below).
	let baked = false;
	let disposed = false;
	function ensureBaked() {
		if (baked || disposed) return;
		baked = true; // set BEFORE bake so a re-entrant intersection can't double-bake
		buildSprites(); // bakes sprites (+ mutedSprites on hover devices), and calls renderLegend()
		assignFacings(); // replace the placeholder all-zero angleIdx with real facings now sprites exist
	}
	const idleId = window.requestIdleCallback
		? window.requestIdleCallback(() => ensureBaked(), { timeout: 4000 })
		: window.setTimeout(ensureBaked, 2000);

	// Needed eagerly for canvas sizing in geometry() (was set inside buildSprites,
	// which we now defer) — else the canvas sizes at dpr=1 and looks blurry until
	// the bake finally runs.
	dpr = Math.min(window.devicePixelRatio || 1, 2);
	geometry();
	// Clearing zones are sized from the labels' actual text metrics — if the
	// custom font swaps in after this first layout, refresh just the zones
	// (not the whole geometry) rather than leaving them sized to the fallback.
	document.fonts?.ready?.then(computeClearZones);

	// Stops scheduling frames entirely once the field is far out of view (mirrors
	// intro-poppies.ts's animate()).
	let observer: IntersectionObserver | null = null;
	if (reduce) {
		// No rAF loop — just make sure sprites exist by the time it approaches, and
		// paint the current window (scroll/resize repaints are handled above).
		observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				ensureBaked();
				renderStatic();
				observer?.disconnect();
				observer = null;
			},
			{ rootMargin: "200px 0px" },
		);
		observer.observe(root);
	} else {
		observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					// Bake synchronously before the first scheduled frame so it already
					// has real sprites + facings (no first-frame pop).
					ensureBaked();
					if (!raf) {
						lastFrameT = 0; // don't let the stopped gap pollute the cadence EMA
						raf = requestAnimationFrame(frame);
					}
				} else if (raf) {
					cancelAnimationFrame(raf);
					raf = 0;
				}
			},
			{ rootMargin: "200px 0px" },
		);
		observer.observe(root);
	}

	return () => {
		disposed = true; // block any stray bake after teardown (e.g. an old instance's observer callback across astro:page-load)
		if (raf) cancelAnimationFrame(raf);
		if (staticRaf) cancelAnimationFrame(staticRaf);
		if (swapRaf) cancelAnimationFrame(swapRaf);
		canvasB.remove();
		if (window.cancelIdleCallback) window.cancelIdleCallback(idleId);
		else window.clearTimeout(idleId);
		observer?.disconnect();
		window.clearTimeout(resizeTimer);
		window.removeEventListener("scroll", onScroll);
		window.removeEventListener("resize", onResize);
		stage.removeEventListener("pointermove", onStagePointerMove);
		stage.removeEventListener("pointerleave", onStagePointerLeave);
		battleLabelHandlers.forEach(({ el, onEnter, onLeave }) => {
			el.removeEventListener("pointerenter", onEnter);
			el.removeEventListener("pointerleave", onLeave);
		});
	};
}

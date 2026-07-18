// Canvas controller for the poppy field. One rAF loop stamps pre-rendered
// sprites at each poppy's home + a wind offset plus a scroll-driven lift
// (scrolling down pushes poppies up, scrolling up settles them back). Year/
// battle labels carve an elliptical "clearing" out of the poppies around them
// (see computeClearZones/inClearZone).

import {
	computePoppyHomes,
	totalHeight,
	monthIndexForY,
	yForMonthIndex,
	maxHalfWidth,
	effMonthH,
	type Poppy,
} from "./layout";
import { bakePoppyAngleSprites, oklchToHex, type AngleSprites } from "./poppy-3d-sprites";
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
	POPPY_LEAN,
	POPPY_LEAN_VAR,
} from "./constants";
import { DEFAULTS, type FieldParams } from "./params";

// The baked poppy doesn't fill its whole sprite cell (there's transparent
// padding around the flower), so draw it a bit larger than the old flat sprite
// to match the intended on-page size.
const SPRITE_DRAW_SCALE = 1.7;

const LIFT_PX = 42; // max rise/fall (px) at full scroll speed, scaled per-poppy by rScale

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

	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
	// Cached from scroll/resize rather than re-read every rAF frame (forces layout).
	let canvasTop = 0;
	function measureCanvasTop() {
		canvasTop = canvas!.getBoundingClientRect().top;
	}

	function buildSprites() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		sprites = bakePoppyAngleSprites(dpr, {
			combat: oklchToHex(params.combatL, params.combatC, params.combatH),
			disease: oklchToHex(params.diseaseL, params.diseaseC, params.diseaseH),
		});
		mutedSprites = bakePoppyAngleSprites(dpr, {
			combat: oklchToHex(Math.min(1, params.combatL + 0.2), params.combatC * 0.15, params.combatH),
			disease: oklchToHex(Math.min(1, params.diseaseL + 0.2), params.diseaseC * 0.15, params.diseaseH),
		});
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

	// Recompute everything that depends on geometry params or container size.
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
		canvas!.width = Math.round(W * dpr);
		canvas!.height = Math.round(H * dpr);
		ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
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

	function paint(vTop: number, vBot: number, t: number) {
		const cx = W / 2;
		const amp = (reduce ? 0 : 0.26) + gustEase;
		const lift = reduce ? 0 : scrollLiftEase * LIFT_PX; // signed: down lifts, up settles
		const sizeAmp = 0.4 * params.sizeVariance;
		if (!reduce) hoverT += ((hoverBattle ? 1 : 0) - hoverT) * 0.12; // ease toward target, no snap
		ctx!.clearRect(0, vTop, W, vBot - vTop);
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
			ctx!.save();
			ctx!.translate(homeX + wind * 7 + driftX, p.y - poppyLift);
			// gentle stem sway only — a full rotation would spin the baked top-light
			ctx!.rotate(wind * 0.4);
			if (!hl && hoverT > 0.001) {
				// Crossfade toward the muted, low-chroma twin as a battle comes into focus.
				const mutedGroup = p.cause ? mutedSprites.disease : mutedSprites.combat;
				const mutedSpr = mutedGroup[angleIdx[i]] ?? mutedGroup[0];
				if (hoverT < 0.999) {
					ctx!.globalAlpha = alpha;
					ctx!.drawImage(spr, -size / 2, -size / 2, size, size);
				}
				if (mutedSpr) {
					ctx!.globalAlpha = alpha * hoverT;
					ctx!.drawImage(mutedSpr, -size / 2, -size / 2, size, size);
				}
			} else {
				ctx!.globalAlpha = alpha;
				ctx!.drawImage(spr, -size / 2, -size / 2, size, size);
			}
			ctx!.restore();
		}
	}

	function renderStatic() {
		paint(0, H, 0);
	}

	function frame(t: number) {
		const vh = window.innerHeight;
		// Covers the sprite's own overhang past its home y plus max scroll-lift, so
		// a poppy near the culled edge never draws into a region clearRect skipped.
		const pad = SPRITE_BASE * 2 + LIFT_PX;
		const vTop = Math.max(0, -canvasTop - pad);
		const vBot = Math.min(H, -canvasTop + vh + pad);
		// Eased rather than read directly, giving the scroll-driven sway/lift its lag.
		gustEase += (gust - gustEase) * 0.05;
		scrollLiftEase += (scrollLift - scrollLiftEase) * 0.05;
		if (vBot > vTop) paint(vTop, vBot, t);
		gust *= 0.95;
		scrollLift *= 0.95;
		raf = requestAnimationFrame(frame);
	}

	// --- interaction ---
	let lastY = window.scrollY;
	const onScroll = () => {
		const dy = window.scrollY - lastY; // + scrolling down, − scrolling up
		lastY = window.scrollY;
		if (!reduce) {
			gust = Math.min(0.9, gust + Math.abs(dy) * 0.002);
			scrollLift = Math.max(-0.9, Math.min(0.9, scrollLift + dy * 0.002));
		}
		measureCanvasTop();
	};
	window.addEventListener("scroll", onScroll, { passive: true });

	const onCanvasPointerMove = (e: PointerEvent) => {
		const r = canvas.getBoundingClientRect();
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
	const onCanvasPointerLeave = () => {
		tip.dataset.show = "0";
	};
	canvas.addEventListener("pointermove", onCanvasPointerMove);
	canvas.addEventListener("pointerleave", onCanvasPointerLeave);

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
	root.querySelectorAll<HTMLElement>("[data-battle]").forEach((el) => {
		const onEnter = () => setHoverBattle(el.dataset.battle ?? null);
		const onLeave = () => setHoverBattle(null);
		el.addEventListener("pointerenter", onEnter);
		el.addEventListener("pointerleave", onLeave);
		battleLabelHandlers.push({ el, onEnter, onLeave });
	});

	let raf = 0;
	let resizeTimer = 0;
	const onResize = () => {
		window.clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(() => {
			// Rebaking sprites means spinning up two full Three.js scenes — only
			// worth it if the device pixel ratio actually changed (e.g. dragging
			// the window to a different-DPR display); a plain width change just
			// needs new geometry.
			if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) buildSprites();
			geometry();
			measureCanvasTop();
			if (reduce) renderStatic();
		}, 150);
	};
	window.addEventListener("resize", onResize);

	// The sprite bake is tens of ms of main-thread jank, so defer it until the
	// field approaches the viewport (see the observer below).
	let baked = false;
	let disposed = false;
	function ensureBaked() {
		if (baked || disposed) return;
		baked = true; // set BEFORE bake so a re-entrant intersection can't double-bake
		buildSprites(); // bakes sprites + mutedSprites, and calls renderLegend()
		assignFacings(); // replace the placeholder all-zero angleIdx with real facings now sprites exist
	}

	// Needed eagerly for canvas sizing in geometry() (was set inside buildSprites,
	// which we now defer) — else the canvas sizes at dpr=1 and looks blurry until
	// the bake finally runs.
	dpr = Math.min(window.devicePixelRatio || 1, 2);
	geometry();
	measureCanvasTop();
	// Clearing zones are sized from the labels' actual text metrics — if the
	// custom font swaps in after this first layout, refresh just the zones
	// (not the whole geometry) rather than leaving them sized to the fallback.
	document.fonts?.ready?.then(computeClearZones);

	// Stops scheduling frames entirely once the field is far out of view (mirrors
	// intro-poppies.ts's animate()).
	let observer: IntersectionObserver | null = null;
	if (reduce) {
		// No rAF loop — bake + paint once the first time it approaches the viewport.
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
					if (!raf) raf = requestAnimationFrame(frame);
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
		observer?.disconnect();
		window.clearTimeout(resizeTimer);
		window.removeEventListener("scroll", onScroll);
		window.removeEventListener("resize", onResize);
		canvas.removeEventListener("pointermove", onCanvasPointerMove);
		canvas.removeEventListener("pointerleave", onCanvasPointerLeave);
		battleLabelHandlers.forEach(({ el, onEnter, onLeave }) => {
			el.removeEventListener("pointerenter", onEnter);
			el.removeEventListener("pointerleave", onLeave);
		});
	};
}

// Canvas controller for the poppy field. One rAF loop stamps pre-rendered
// sprites at each poppy's home + a wind offset (ambient breeze + decaying scroll
// gust). Layout and colours come from the locked-in DEFAULTS in params.ts.
// Honours prefers-reduced-motion; interaction is math (pointer y → month).

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
import { SPRITE_BASE, HOVER_SPINE_PX, POPPY_UNIT, EDGE_MARGIN, POPPY_LEAN, POPPY_LEAN_VAR } from "./constants";
import { DEFAULTS, type FieldParams } from "./params";

// The baked poppy doesn't fill its whole sprite cell (there's transparent
// padding around the flower), so draw it a bit larger than the old flat sprite
// to match the intended on-page size.
const SPRITE_DRAW_SCALE = 1.7;

export function initPoppyField(root: HTMLElement) {
	const canvas = root.querySelector<HTMLCanvasElement>("canvas.poppy-field__canvas");
	const stage = root.querySelector<HTMLElement>(".poppy-field__stage");
	const tip = root.querySelector<HTMLElement>(".poppy-field__tip");
	if (!canvas || !stage || !tip) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const params: FieldParams = { ...DEFAULTS };

	let W = 0;
	let dpr = 1;
	let H = totalHeight(params);
	let xScale = 1;
	let sprites: AngleSprites = { combat: [], disease: [], angles: [] };
	let homes: Poppy[] = [];
	let angleIdx: Int16Array = new Int16Array(0); // baked-sprite index per poppy (its facing)
	let gust = 0;
	let hoverBattle: string | null = null;

	function buildSprites() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		sprites = bakePoppyAngleSprites(dpr, {
			combat: oklchToHex(params.combatL, params.combatC, params.combatH),
			disease: oklchToHex(params.diseaseL, params.diseaseC, params.diseaseH),
		});
	}

	// Recompute everything that depends on geometry params or container size.
	function geometry() {
		H = totalHeight(params);
		homes = computePoppyHomes(params, 3).sort((a, b) => a.rScale - b.rScale);
		stage!.style.height = `${H}px`;
		stage!.style.maxWidth = `${params.maxWidth}px`; // cap canvas width (centred)
		W = canvas!.clientWidth; // reflects the capped stage width
		canvas!.width = Math.round(W * dpr);
		canvas!.height = Math.round(H * dpr);
		ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		// No min(1) clamp → the widest month scales UP to fill wide canvases too,
		// so the field always spans (canvas width − edge margins).
		xScale = (W / 2 - EDGE_MARGIN) / maxHalfWidth(params);
		assignFacings();
		positionLabels();
	}

	// Pick each poppy's baked yaw sprite from its offset from the spine → the field
	// leans outward in unison (left poppies face left, right face right), with a
	// little per-poppy jitter so it reads organic rather than mechanical.
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

	function inBattle(y: number, id: string) {
		const b = BATTLES.find((x) => x.id === id);
		if (!b) return false;
		const half = effMonthH(params) / 2;
		return y >= yForMonthIndex(b.startIndex, params) - half && y <= yForMonthIndex(b.endIndex, params) + half;
	}

	function paint(vTop: number, vBot: number, t: number) {
		const cx = W / 2;
		const amp = (reduce ? 0 : 0.18) + gust;
		const sizeAmp = 0.4 * params.sizeVariance;
		ctx!.clearRect(0, vTop, W, vBot - vTop);
		for (let i = 0; i < homes.length; i++) {
			const p = homes[i];
			if (p.y < vTop || p.y > vBot) continue;
			const wind = reduce
				? 0
				: Math.sin(p.y * 0.015 + t * 0.0012 + p.phase) * amp +
					Math.sin(p.x * 0.01 + t * 0.0009) * amp * 0.5;
			const hl = hoverBattle ? inBattle(p.y, hoverBattle) : false;
			const scale = 1 + (p.rScale - 0.5) * 2 * sizeAmp; // variance 0 → all 1.0
			const size = SPRITE_BASE * SPRITE_DRAW_SCALE * params.baseSize * scale * (hl ? 1.28 : 1);
			const depthAlpha = Math.max(0, Math.min(1, 0.55 + (scale - 0.7) * 0.5));
			const group = p.cause ? sprites.disease : sprites.combat;
			const spr = group[angleIdx[i]] ?? group[0];
			if (!spr) continue;
			ctx!.save();
			ctx!.translate(cx + p.x * xScale + wind * 6, p.y);
			// gentle stem sway only — a full rotation would spin the baked top-light
			ctx!.rotate(wind * 0.35);
			ctx!.globalAlpha = hl ? 1 : 1 + (depthAlpha - 1) * params.opacityVariance; // variance 0 → opaque
			ctx!.drawImage(spr, -size / 2, -size / 2, size, size);
			ctx!.restore();
		}
	}

	function renderStatic() {
		paint(0, H, 0);
	}

	function frame(t: number) {
		const rectTop = canvas!.getBoundingClientRect().top;
		const vh = window.innerHeight;
		const pad = SPRITE_BASE * 2;
		const vTop = Math.max(0, -rectTop - pad);
		const vBot = Math.min(H, -rectTop + vh + pad);
		if (vBot > vTop) paint(vTop, vBot, t);
		gust *= 0.92;
		raf = requestAnimationFrame(frame);
	}

	// --- interaction ---
	let lastY = window.scrollY;
	window.addEventListener(
		"scroll",
		() => {
			const d = Math.abs(window.scrollY - lastY);
			lastY = window.scrollY;
			if (!reduce) gust = Math.min(0.9, gust + d * 0.002);
		},
		{ passive: true },
	);

	canvas.addEventListener("pointermove", (e) => {
		const r = canvas.getBoundingClientRect();
		const x = e.clientX - r.left;
		const y = e.clientY - r.top;
		if (Math.abs(x - W / 2) < HOVER_SPINE_PX) {
			const m = MONTHLY[monthIndexForY(y, params)];
			tip.textContent = `${monthLabel(m)} · ~${(m.deaths * POPPY_UNIT).toLocaleString()} dead`;
			tip.style.transform = `translate(${x}px, ${y}px)`;
			tip.dataset.show = "1";
		} else {
			tip.dataset.show = "0";
		}
	});
	canvas.addEventListener("pointerleave", () => {
		tip.dataset.show = "0";
	});

	root.querySelectorAll<HTMLElement>("[data-battle]").forEach((el) => {
		el.addEventListener("pointerenter", () => {
			hoverBattle = el.dataset.battle ?? null;
			if (reduce) renderStatic();
		});
		el.addEventListener("pointerleave", () => {
			hoverBattle = null;
			if (reduce) renderStatic();
		});
	});

	let raf = 0;
	let resizeTimer = 0;
	window.addEventListener("resize", () => {
		window.clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(() => {
			buildSprites();
			geometry();
			if (reduce) renderStatic();
		}, 150);
	});

	buildSprites();
	geometry();
	if (reduce) renderStatic();
	else raf = requestAnimationFrame(frame);
}

// Deterministic, seeded, PARAMETERISED layout. Each poppy gets an immutable
// "home" computed from the data + a fixed seed + the current FieldParams. The
// renderer animates offsets on top of these homes. Same seed + same params →
// identical field. Each poppy also carries its raw randomness (rScale) so that
// changing size/opacity variance never reshuffles the field.

import { MONTHLY, diseaseCount } from "./wwi-monthly-deaths";
import { MONTH_H as BASE_MONTH_H, DENSITY, SEED, PAD_Y as PAD_BASE } from "./constants";
import type { FieldParams } from "./params";

export interface Poppy {
	x: number; // logical px offset from the spine (renderer applies a responsive xScale)
	y: number; // px from the top of the field
	cause: 0 | 1; // 0 = combat (bright, 5-petal) · 1 = disease/other (darker, 4-petal)
	variant: number; // sprite variant within the cause group
	rot: number; // base rotation (radians)
	phase: number; // wind phase offset
	rScale: number; // raw 0..1 randomness → size & opacity resolved live at draw time
}

// Small, fast, seedable PRNG (mulberry32).
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Effective row height grows with the height multiplier — taller rows spread the
// same poppies over more pixels, which is the real lever for less overlap.
export const effMonthH = (p: FieldParams) => BASE_MONTH_H * p.heightScale;

// A dozen-ish stray poppies fade in/out at each end of the field (see
// computePoppyHomes) — tucked into the existing padY margin, not a new band.
const LEAD_COUNT = 48;

// Max fraction of a row height a poppy strays vertically from its month centre
// (actual jitter tops out around 0.78 — this leaves a small buffer above that).
const VBLEED = 1;
// Top/bottom breathing room scales with row height so edge poppies never crop.
export const padY = (p: FieldParams) => Math.max(PAD_BASE, effMonthH(p) * VBLEED + 30);

export const totalHeight = (p: FieldParams) => MONTHLY.length * effMonthH(p) + padY(p) * 2;
export const yForMonthIndex = (i: number, p: FieldParams) => padY(p) + i * effMonthH(p) + effMonthH(p) / 2;
export const monthIndexForY = (y: number, p: FieldParams) =>
	Math.max(0, Math.min(MONTHLY.length - 1, Math.floor((y - padY(p)) / effMonthH(p))));

// Logical half-width so horizontal extent ∝ deaths (the envelope IS the curve).
// Kept in BASE units; the renderer's xScale maps it to the container.
const baseHalf = (deaths: number) => deaths / (DENSITY * BASE_MONTH_H) / 2;

// Per-month half-widths, smoothed by a weighted moving average whose window
// grows with `smoothness` (0 = raw month bumps, 1 = broadly smoothed).
function smoothedHalves(p: FieldParams): number[] {
	const raw = MONTHLY.map((m) => baseHalf(m.deaths));
	const win = Math.round(p.smoothness * 6);
	if (win <= 0) return raw;
	return raw.map((_, i) => {
		let sum = 0;
		let wsum = 0;
		for (let k = -win; k <= win; k++) {
			const j = i + k;
			if (j < 0 || j >= raw.length) continue;
			const w = 1 - Math.abs(k) / (win + 1);
			sum += raw[j] * w;
			wsum += w;
		}
		return sum / wsum;
	});
}

export const maxHalfWidth = (p: FieldParams) => Math.max(...smoothedHalves(p));

export function computePoppyHomes(p: FieldParams, variants = 3): Poppy[] {
	const rand = mulberry32(SEED);
	const halves = smoothedHalves(p);
	const mH = effMonthH(p);

	const pad = padY(p);

	// Continuous half-width at any y (smoothstep between month centres) → the
	// envelope follows a smooth curve instead of hard per-month steps.
	const halfAt = (y: number) => {
		const f = (y - pad) / mH - 0.5;
		const i0 = Math.floor(f);
		const t = f - i0;
		const a = halves[Math.max(0, Math.min(halves.length - 1, i0))];
		const b = halves[Math.max(0, Math.min(halves.length - 1, i0 + 1))];
		const s = t * t * (3 - 2 * t); // smoothstep
		return a + (b - a) * s;
	};

	// Fraction of poppies to actually place. Thinning scales the per-month count
	// (and the disease share with it) without touching the envelope half-width, so
	// the field's SHAPE is unchanged — it just fills more sparsely. Only affects
	// mobile; on desktop thin === 1 leaves the field byte-identical.
	const thin = p.thin ?? 1;

	const homes: Poppy[] = [];
	MONTHLY.forEach((m, i) => {
		const cy = yForMonthIndex(i, p);
		const count = Math.max(1, Math.round(m.deaths * thin));
		const dCount = Math.round(diseaseCount(m) * thin); // first dCount poppies this month are disease/other
		for (let k = 0; k < count; k++) {
			// Uniform fill of the full row (gapless at any spacing) + a soft gaussian
			// tail for organic blending/feathering between months.
			const y = cy + (rand() - 0.5) * mH + (rand() + rand() - 1) * mH * 0.28;
			const half = halfAt(y);
			const x = (rand() * 2 - 1) * half;
			homes.push({
				x,
				y,
				cause: k < dCount ? 1 : 0, // scattered, since x/y are already randomised
				variant: (rand() * variants) | 0,
				rot: (rand() * 2 - 1) * 0.5,
				phase: rand() * Math.PI * 2,
				rScale: rand(),
			});
		}
	});

	// Lead-in / lead-out: a dozen stray poppies tucked into the existing top/
	// bottom breathing room (padY) — no extra height, no shift to the real
	// months above. Tapers to a single point at the outer edge rather than
	// fanning out, so it reads as a few blooms drifting off rather than a new band.
	// Only spans a fraction of padY (not the whole margin) so the fade-in reads
	// as a tight scatter near the data rather than stretching the full pad.
	const LEAD_SPAN = 0.55;
	const H = totalHeight(p);
	const addLead = (edgeIndex: number, direction: 1 | -1) => {
		const m = MONTHLY[edgeIndex];
		const half = halves[edgeIndex];
		const diseaseShare = diseaseCount(m) / m.deaths;
		const edgeY = direction < 0 ? pad : H - pad; // the field's actual top/bottom boundary
		const leadCount = Math.max(1, Math.round(LEAD_COUNT * thin));
		for (let k = 0; k < leadCount; k++) {
			const d = rand() * rand(); // biased toward 0 → sparser further from the data
			const y = edgeY + direction * d * pad * LEAD_SPAN;
			const x = (rand() * 2 - 1) * half * (1 - d);
			homes.push({
				x,
				y,
				cause: rand() < diseaseShare ? 1 : 0,
				variant: (rand() * variants) | 0,
				rot: (rand() * 2 - 1) * 0.5,
				phase: rand() * Math.PI * 2,
				rScale: rand(),
			});
		}
	};
	addLead(0, -1);
	addLead(MONTHLY.length - 1, 1);

	return homes;
}

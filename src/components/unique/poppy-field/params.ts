// Locked-in parameters for the poppy field, read by the layout and renderer.
// Geometry params (heightScale, maxWidth, smoothness) drive poppy positions;
// appearance params (baseSize, sizeVariance, opacityVariance) and the combat/
// disease OKLCH are read when baking sprites / in the draw loop.

export interface FieldParams {
	heightScale: number; // row-height multiplier — taller = less overlap + taller field
	maxWidth: number; // max canvas width in px (centred within the full-bleed figure)
	smoothness: number; // 0 = rough/stepped edges … 1 = smooth envelope
	thin?: number; // fraction of poppies to render (1 = all) — mobile drops this to de-clutter
	baseSize: number; // overall poppy draw-size multiplier
	sizeVariance: number; // 0 = every poppy the same size … 1 = full size spread
	opacityVariance: number; // 0 = every poppy fully opaque … 1 = full depth fade
	// Petal colours in OKLCH (perceptually-even). Combat = killed in action (bright);
	// disease = disease / flu / other (duller). Baked into the sprites.
	combatL: number;
	combatC: number;
	combatH: number;
	diseaseL: number;
	diseaseC: number;
	diseaseH: number;
}

// Tuned via the live control panel and locked in.
export const DEFAULTS: FieldParams = {
	heightScale: 1.85,
	maxWidth: 1580,
	smoothness: 0.3,
	baseSize: 0.9,
	sizeVariance: 1,
	opacityVariance: 0,
	// These were originally tuned as L 0.845 / C 0.305 / H 28 (combat) and
	// L 0.45 / C 0.2 / H 22 (disease) — both out of the sRGB gamut, so
	// oklchToHex was silently clipping them to #ff5148 / #a9001a per-channel
	// (see poppy3d.ts). Recorded here as the *actual* in-gamut OKLCH of those
	// exact pixels, so the look is preserved byte-for-byte through the fixed,
	// properly gamut-mapped conversion instead of relying on clipping.
	combatL: 0.6763,
	combatC: 0.2117,
	combatH: 27.29,
	diseaseL: 0.463,
	diseaseC: 0.1876,
	diseaseH: 24.75,
};

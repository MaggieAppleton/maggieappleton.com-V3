// Locked-in parameters for the poppy field, read by the layout and renderer.

export interface FieldParams {
	heightScale: number; // row-height multiplier — taller = less overlap + taller field
	maxWidth: number; // max canvas width in px (centred within the full-bleed figure)
	smoothness: number; // 0 = rough/stepped edges … 1 = smooth envelope
	thin?: number; // fraction of poppies to render (1 = all) — mobile drops this to de-clutter
	baseSize: number;
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
	// Originally tuned as L 0.845/C 0.305/H 28 (combat) and L 0.45/C 0.2/H 22
	// (disease), both out-of-gamut and silently clipped by oklchToHex to
	// #ff5148/#a9001a. Recorded here as the actual in-gamut OKLCH of those
	// pixels so the look survives the fixed, properly gamut-mapped conversion.
	combatL: 0.6763,
	combatC: 0.2117,
	combatH: 27.29,
	diseaseL: 0.463,
	diseaseC: 0.1876,
	diseaseH: 24.75,
};

// Locked-in parameters for the poppy field, read by the layout and renderer.
// Geometry params (heightScale, maxWidth, smoothness) drive poppy positions;
// appearance params (baseSize, sizeVariance, opacityVariance) and the combat/
// disease OKLCH are read when baking sprites / in the draw loop.

export interface FieldParams {
	heightScale: number; // row-height multiplier — taller = less overlap + taller field
	maxWidth: number; // max canvas width in px (centred within the full-bleed figure)
	smoothness: number; // 0 = rough/stepped edges … 1 = smooth envelope
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
	combatL: 0.66,
	combatC: 0.22,
	combatH: 29,
	diseaseL: 0.5,
	diseaseC: 0.195,
	diseaseH: 26,
};

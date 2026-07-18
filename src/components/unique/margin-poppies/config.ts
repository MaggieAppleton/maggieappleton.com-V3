// Placement + pose data for the decorative margin poppies. Pure data (no three
// import) so it can be shared by BOTH the .astro frontmatter — which renders one
// <canvas> per entry with its inline gutter placement — and the client renderer,
// which reads the same array by index for each bloom's 3D pose. One source of
// truth, so the DOM and the WebGL poses can never drift apart.

// Below this viewport width the left/right gutters are too slim to hold a poppy
// clear of the text column, so the whole layer hides (see the @media rule in
// MarginPoppies.astro — keep the two numbers in sync). Desktop-only by design.
export const MARGIN_BREAKPOINT = 1200;

export interface MarginPoppy {
	side: "left" | "right";
	// Vertical position as a % down the article (of .styled-main's height). The
	// overlay is absolutely sized to the article, so a % here tracks the same spot
	// on the page regardless of font size or viewport.
	top: number;
	// Gap in px between the text column's edge and the poppy's *inner* edge — how
	// far the bloom sits out into the gutter. Larger = deeper toward the page edge.
	inset: number;
	// On-screen canvas size in px (square). The bloom fills ~2/3 of it.
	size: number;
	// deg — 3D turn about the vertical axis. Negative faces the left page edge,
	// positive faces the right. So a bloom "faces outward" when its yaw sign
	// points toward its own margin (−ve on the left, +ve on the right).
	yaw: number;
	// deg — 3D tip about the horizontal axis. Negative tips the face up toward the
	// top of the page; positive tips it down. Mixed for a natural scatter.
	pitch: number;
}

// Four loose clusters — two pairs, two singles — with the side alternating so
// the eye is led *down toward* the poppy field. A few blooms are noticeably
// smaller and pushed deeper into the gutter, the way real poppies scatter. They
// are deliberately confined to the band between the intro poppies (~top) and the
// full-width poppy field (which begins ~46% down): they only ever appear above
// the field, trailing into it. Below the field the gutters stay bare.
export const MARGIN_POPPIES: MarginPoppy[] = [
	// cluster 1 — left, a pair just below the opening
	{ side: "left", top: 14, inset: 66, size: 108, yaw: -30, pitch: -14 }, // faces out (left), up
	{ side: "left", top: 17.5, inset: 126, size: 62, yaw: 34, pitch: -8 }, // faces in, up
	// cluster 2 — right, a single
	{ side: "right", top: 25, inset: 68, size: 100, yaw: 32, pitch: -12 }, // faces out (right), up
	// cluster 3 — left, a pair
	{ side: "left", top: 34, inset: 64, size: 104, yaw: 26, pitch: 9 }, // faces in, tips down
	{ side: "left", top: 37.5, inset: 124, size: 60, yaw: -40, pitch: -13 }, // faces out (left), up
	// cluster 4 — right, a single leading into the field
	{ side: "right", top: 44, inset: 68, size: 96, yaw: -24, pitch: -7 }, // faces in (left), up
];

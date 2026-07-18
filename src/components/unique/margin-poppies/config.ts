// Placement + pose data for the margin poppies. Pure data, shared by both the
// .astro frontmatter (DOM placement) and the client renderer (3D pose), so the
// two can never drift apart.

// Below this width the gutters are too slim for a poppy clear of the text
// column (keep in sync with the @media rule in MarginPoppies.astro).
export const MARGIN_BREAKPOINT = 1200;

export interface MarginPoppy {
	side: "left" | "right";
	top: number; // % down the article (of .styled-main's height)
	inset: number; // px from the text column's edge to the poppy's inner edge
	size: number; // on-screen canvas size in px (square); bloom fills ~2/3 of it
	yaw: number; // deg — 3D turn about vertical; -ve faces left, +ve faces right
	pitch: number; // deg — 3D tip about horizontal; -ve tips up, +ve tips down
}

// Four loose clusters, side alternating, leading the eye down toward the poppy
// field. Confined to the band above the field (which begins ~46% down) —
// below the field the gutters stay bare.
export const MARGIN_POPPIES: MarginPoppy[] = [
	// cluster 1 — left, a pair just below the opening
	{ side: "left", top: 9, inset: 66, size: 108, yaw: -30, pitch: -14 }, // faces out (left), up
	{ side: "left", top: 12.5, inset: 126, size: 62, yaw: 34, pitch: -8 }, // faces in, up
	// cluster 2 — right, a single
	{ side: "right", top: 20, inset: 68, size: 100, yaw: 32, pitch: -12 }, // faces out (right), up
	// cluster 3 — left, a pair
	{ side: "left", top: 29, inset: 64, size: 104, yaw: 26, pitch: 9 }, // faces in, tips down
	{ side: "left", top: 32.5, inset: 124, size: 60, yaw: -40, pitch: -13 }, // faces out (left), up
	// cluster 4 — right, a single leading into the field
	{ side: "right", top: 39, inset: 68, size: 96, yaw: -24, pitch: -7 }, // faces in (left), up
];

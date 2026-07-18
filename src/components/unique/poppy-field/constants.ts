// Shared geometry for the poppy field. Imported by BOTH the .astro frontmatter
// (to position year ticks + battle labels) and the client renderer, so the
// overlay labels always line up with the canvas.

export const SEED = 19141918; // fixed → identical field every load, art-directable
export const POPPY_UNIT = 1000; // military dead represented by one poppy
export const MONTH_H = 54; // CSS px of vertical band per month
export const DENSITY = 0.0055; // poppies per px² — sets field thickness & makes width ∝ count
export const SPRITE_BASE = 26; // base sprite draw size (CSS px)
// Vertical breathing room at top & bottom so poppies bleeding past the first/last
// month band are never cropped by the canvas edge (max bleed ≈0.9·MONTH_H + a
// rotated full-size sprite's half-diagonal). Also used as the horizontal fit margin.
export const PAD_Y = 80;
// px kept clear at left/right for poppy CENTRES so the sprite (≤ ~26px half at
// max size) just reaches the canvas edge — combined with the figure's 24px inset
// this gives ~24px of visible margin at the widest point.
export const EDGE_MARGIN = 26;
// On phones the field breaks out past the screen edges (see PoppyField.astro's
// mobile breakout) and we let the widest months bleed off-screen, so the centre
// inset shrinks — the sprite overhang alone is enough margin there.
export const EDGE_MARGIN_MOBILE = 14;
export const EDGE_INSET = 24; // px inset from page edges (spec)

// Below this viewport width the field switches to its phone layout: fewer,
// wider-spread poppies that bleed past the screen edges (see MOBILE_* below and
// the matching @media rules). Kept in sync between the CSS breakout and the JS
// geometry so the canvas width and the poppy math agree at the boundary.
export const MOBILE_BREAKPOINT = 640;
// Keep this fraction of the poppies on mobile — a slight thinning so the field
// reads less clustered on a narrow screen. Shape is preserved (the envelope
// half-width is count-independent); only the fill density drops.
export const MOBILE_THIN = 0.8;
// Taller rows on mobile (vs DEFAULTS.heightScale) spread the same months over
// more vertical pixels, so poppies overlap less — at the cost of a longer field.
export const MOBILE_HEIGHT_SCALE = 2.2;
export const HOVER_SPINE_PX = 90; // pointer within this of the spine → show month readout
// Unison facing: a poppy's yaw is set by how far it sits from the central spine —
// poppies on the left face left, the middle face forward, the right face right —
// plus a little per-poppy jitter so the field isn't mechanical. (radians)
export const POPPY_LEAN = 64 * (Math.PI / 180); // yaw at the widest edge
export const POPPY_LEAN_VAR = 3 * (Math.PI / 180); // ± per-poppy jitter

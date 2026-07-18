// Shared geometry, imported by both PoppyField.astro (label positions) and the
// client renderer, so the two never drift apart.

export const SEED = 19141918; // fixed → identical field every load, art-directable
export const POPPY_UNIT = 1000; // military dead represented by one poppy
export const MONTH_H = 54; // CSS px of vertical band per month
export const DENSITY = 0.0055; // poppies per px² — sets field thickness & makes width ∝ count
export const SPRITE_BASE = 26; // base sprite draw size (CSS px)
export const PAD_Y = 80; // top/bottom breathing room so edge poppies never crop; also the horizontal fit margin
// px kept clear at left/right for poppy centres so the sprite just reaches the canvas edge.
export const EDGE_MARGIN = 26;
// Smaller on phones — the field bleeds off-screen there anyway (see PoppyField.astro).
export const EDGE_MARGIN_MOBILE = 14;
export const EDGE_INSET = 24; // px inset from page edges (spec)

// Below this width the field switches to its phone layout (see MOBILE_* below
// and the matching @media rules — keep this in sync with those).
export const MOBILE_BREAKPOINT = 640;
export const MOBILE_THIN = 0.8; // fraction of poppies kept on mobile, for a less clustered read
export const MOBILE_HEIGHT_SCALE = 2.2; // taller rows on mobile so poppies overlap less
export const HOVER_SPINE_PX = 90; // pointer within this of the spine → show month readout
// A poppy's yaw is set by its distance from the spine (left faces left, right faces
// right) plus per-poppy jitter so it doesn't read mechanical. (radians)
export const POPPY_LEAN = 64 * (Math.PI / 180); // yaw at the widest edge
export const POPPY_LEAN_VAR = 3 * (Math.PI / 180); // ± per-poppy jitter

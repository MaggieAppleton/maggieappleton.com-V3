export const durations = {
  instant: 0.1,
  fast: 0.15,
  base: 0.2,
  slow: 0.3,
  slower: 0.5,
};

export const easings = {
  out: [0.215, 0.61, 0.355, 1] as const,
  outStrong: [0.16, 1, 0.3, 1] as const,
  inOut: [0.645, 0.045, 0.355, 1] as const,
  spring: [0.2, 1, 0.8, 1] as const,
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

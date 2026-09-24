import { spring } from 'motion';

const clamp = value => Math.min(1, Math.max(0, value));

const cubicBezierProgress = (curve, progress) => {
  const [x1, y1, x2, y2] = curve;
  const sample = (first, second, time) => {
    const inverse = 1 - time;
    return (3 * inverse * inverse * time * first)
      + (3 * inverse * time * time * second)
      + (time * time * time);
  };
  const slope = (first, second, time) => (
    (3 * (1 - time) * (1 - time) * first)
    + (6 * (1 - time) * time * (second - first))
    + (3 * time * time * (1 - second))
  );
  let time = progress;
  for (let index = 0; index < 6; index += 1) {
    const currentSlope = slope(x1, x2, time);
    if (Math.abs(currentSlope) < 0.0001) break;
    time -= (sample(x1, x2, time) - progress) / currentSlope;
    time = clamp(time);
  }
  return sample(y1, y2, time);
};

const measureSampler = sample => {
  let peak = 1;
  for (let index = 0; index <= 100; index += 1) {
    peak = Math.max(peak, sample(index / 100));
  }
  return peak;
};

export const createProgressSampler = transition => {
  if (transition.type === 'easing') {
    const sample = progress => cubicBezierProgress(transition.ease, clamp(progress));
    return {
      duration: transition.duration * 1000,
      peak: measureSampler(sample),
      sample,
    };
  }

  const { type: _type, ...options } = transition;
  const generator = spring({
    ...options,
    keyframes: [0, 1],
  });
  let duration = 1000;
  let peak = 1;

  for (let time = 0; time <= 5000; time += 16) {
    const state = generator.next(time);
    peak = Math.max(peak, state.value);
    if (state.done) {
      duration = Math.max(16, time);
      break;
    }
  }

  return {
    duration,
    peak,
    sample: progress => {
      if (progress <= 0) return 0;
      if (progress >= 1) return 1;
      return generator.next(duration * progress).value;
    },
  };
};

export const scaleOvershootProgress = (
  progress,
  peak,
  initialScale,
  overshootScale,
) => {
  const baseScale = initialScale + ((1 - initialScale) * clamp(progress));
  if (progress <= 1 || peak <= 1) return baseScale;
  const overshootProgress = clamp((progress - 1) / (peak - 1));
  return baseScale + ((overshootScale - 1) * overshootProgress);
};

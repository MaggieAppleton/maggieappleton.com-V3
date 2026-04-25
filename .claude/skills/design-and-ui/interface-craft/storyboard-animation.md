# Storyboard Animation

**Part of [Interface Craft](SKILL.md) by Josh Puckett**

A pattern for writing and refactoring React animations into a human-readable storyboard format. Every timing value, scale, position, and spring config is extracted to named constants at the top of the file so you can read the animation like a script and tune any value instantly.

---

## When to use

- User says "animate", "transition", "entrance animation", "storyboard", etc.
- User pastes existing animation code and wants it cleaned up
- User describes a desired animation in plain English
- User points to a file with `motion.*` components that have inline timing/values

## The Storyboard Pattern

Every animated component follows this exact structure:

### 1. ASCII Storyboard Comment

A block comment at the top of the file that reads like a shot list. Anyone can scan it and understand the full sequence without reading code.

```
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after trigger.
 *
 *    0ms   waiting for trigger (scroll into view / mount)
 *  300ms   card fades in, scale 0.85 → 1.0
 *  900ms   heading text highlights
 * 1500ms   detail rows slide up (staggered 200ms)
 * 2100ms   CTA button fades in
 * ───────────────────────────────────────────────────────── */
```

Rules for the storyboard comment:
- Right-align the ms values for scannability
- Use `→` to show value transitions (e.g. `scale 0.8 → 1.5`)
- Note stagger intervals in parentheses
- Keep descriptions short — one line per stage

### 2. TIMING Object

A single `const TIMING` object with every stage delay in milliseconds. This is the **only place** timing values live.

```tsx
const TIMING = {
  cardAppear:    300,   // card fades in and scales up
  headingGlow:   900,   // heading text highlights
  detailRows:    1500,  // rows start staggering in
  ctaButton:     2100,  // button fades in
};
```

Rules:
- Keys are `camelCase`, descriptive verb phrases
- Values are ms after the animation trigger (not deltas between stages)
- Every key gets an inline comment
- Align values and comments for readability

### 3. Element Config Objects

Each animated element (or group of elements) gets its own named config object with all its visual values and spring config.

```tsx
/* Card container */
const CARD = {
  initialScale: 0.85,   // scale before appearing
  finalScale:   1.0,     // resting scale
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
};

/* Detail rows */
const ROWS = {
  stagger:  0.2,   // seconds between each row
  offsetY:  12,    // px each row slides up from
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
  items: [
    { label: "Row 1", value: "A" },
    { label: "Row 2", value: "B" },
  ],
};
```

Rules:
- UPPERCASE name matching the element it controls
- Group ALL values for one element together — scales, positions, colors, springs
- Repeated items are arrays inside the config, rendered with `.map()`
- Spring configs live here, never inline in JSX
- Every value gets a short comment

### 4. Component Body

```tsx
export function MyFigure({ replayTrigger = 0 }: { replayTrigger?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isInView) { setStage(0); return; }

    setStage(0);
    const timers: NodeJS.Timeout[] = [];

    timers.push(setTimeout(() => setStage(1), TIMING.cardAppear));
    timers.push(setTimeout(() => setStage(2), TIMING.headingGlow));
    timers.push(setTimeout(() => setStage(3), TIMING.detailRows));
    timers.push(setTimeout(() => setStage(4), TIMING.ctaButton));

    return () => timers.forEach(clearTimeout);
  }, [isInView, replayTrigger]);

  return ( /* JSX using stage >= N and config values */ );
}
```

Rules:
- Single `stage` state integer (not multiple booleans)
- One `useEffect` with all `setTimeout` calls reading from `TIMING`
- Cleanup clears all timers
- `replayTrigger` prop in dependency array enables click-to-replay
- JSX references config objects: `CARD.initialScale`, not `0.85`
- Stage checks in animate: `stage >= 1 ? CARD.finalScale : CARD.initialScale`

### 5. JSX Pattern for `motion.*` Elements

```tsx
<motion.div
  initial={{
    opacity: 0,
    scale: CARD.initialScale,
  }}
  animate={{
    opacity: stage >= 1 ? 1 : 0,
    scale:   stage >= 1 ? CARD.finalScale : CARD.initialScale,
  }}
  transition={CARD.spring}
>
```

For staggered groups:
```tsx
{ROWS.items.map((item, i) => (
  <motion.div
    key={item.label}
    initial={{ opacity: 0, y: ROWS.offsetY }}
    animate={{
      opacity: stage >= 3 ? 1 : 0,
      y:       stage >= 3 ? 0 : ROWS.offsetY,
    }}
    transition={{ ...ROWS.spring, delay: i * ROWS.stagger }}
  >
    {item.label}
  </motion.div>
))}
```

---

## How to apply

### Refactoring existing code

When the user provides a file or code with animations:

1. **Read the code** and identify every animated element and its timing
2. **Extract** all magic numbers (delays, scales, positions, springs) into config objects
3. **Write the storyboard comment** describing the sequence in plain English
4. **Create the TIMING object** with all stage delays
5. **Create element config objects** grouping values by animated element
6. **Rewrite the component** using the stage pattern
7. **Replace repeated elements** with data-driven `.map()` where applicable

### Writing new animations from a description

When the user describes what they want:

1. **Parse the description** into discrete stages with approximate timing
2. **Write the storyboard comment first** — confirm the sequence with the user if unclear
3. **Define TIMING** with sensible defaults (300ms initial delay, 500-700ms between stages)
4. **Define element configs** with appropriate springs:
   - Cards/containers: `{ stiffness: 300, damping: 30 }` (smooth settle)
   - Pop-ins/badges: `{ stiffness: 500, damping: 25 }` (snappy)
   - Slides/entrances: `{ stiffness: 350, damping: 28 }` (balanced)
5. **Build the component** following the pattern above

### Quick checklist

Before finishing, verify:
- [ ] Storyboard comment at top matches the actual TIMING values
- [ ] Zero magic numbers in JSX or useEffect — everything references a const
- [ ] Springs defined in config objects, not inline
- [ ] Repeated elements use `.map()` over a data array
- [ ] Stage values in JSX are `>=` checks (allows stages to be additive)
- [ ] `replayTrigger` in the dependency array for dev/debug replay support

# DialKit

**Part of [Interface Craft](SKILL.md) by Josh Puckett**

Generate DialKit configurations for React + Motion projects — live control panels for tuning animation and style values in real time.

---

## When to use

- User mentions DialKit, dials, sliders, controls, tune, tweak
- User wants a live UI to adjust animation parameters
- User says "add controls for..." or "let me tune..."

## Mode Detection

### Direct Mode
Triggers when user describes what they want with context:
- "use DialKit to give me sliders for blur and opacity"
- "add dialkit controls for scale, rotation, and a spring"
- "I need toggles and sliders for my card animation"

In direct mode, generate the config immediately based on the request.

### Guided Mode
Triggers when user invokes without specific context or asks for help:
- `/interface-craft dialkit`
- "help me set up dialkit"
- "walk me through adding dialkit"

In guided mode, ask 2-3 concise questions then generate.

## Setup Check

Before generating configs, verify DialKit is installed. If working in a project:

1. Check if `dialkit` is in package.json dependencies
2. If not installed, provide:
```bash
npm install dialkit motion
```

3. Check if DialRoot is set up in a layout file. If not, remind user:
```tsx
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'

// Add to your root layout:
<DialRoot position="top-right" />
```

## Guided Flow Questions

Keep it fast - 2-3 questions max:

1. **Component context**: "What component are you adding controls to? Share the code or describe what you're building."

2. **Property selection**: "What properties do you want to tweak? Common options:
   - **Visual**: blur, opacity, scale, borderRadius
   - **Position**: offsetX, offsetY, rotation
   - **Animation**: spring (with visualDuration/bounce controls)
   - **Interaction**: action buttons, toggles"

3. Generate with smart defaults - don't ask about ranges.

## Smart Defaults

Use these defaults for common properties (users can adjust in the panel):

| Property | Default | Min | Max | Step |
|----------|---------|-----|-----|------|
| blur | 0 | 0 | 100 | 1 |
| opacity | 1 | 0 | 1 | 0.01 |
| scale | 1 | 0.5 | 2 | 0.1 |
| rotation | 0 | -180 | 180 | 1 |
| offsetX | 0 | -100 | 100 | 1 |
| offsetY | 0 | -100 | 100 | 1 |
| borderRadius | 0 | 0 | 50 | 1 |
| shadowBlur | 16 | 0 | 48 | 1 |
| shadowOffsetY | 8 | 0 | 24 | 1 |
| gap | 16 | 0 | 48 | 1 |
| padding | 16 | 0 | 48 | 1 |

## Control Types

See [references/config-patterns.json](references/config-patterns.json) for the full schema. Summary:

### 1. Slider (explicit range)
```tsx
blur: [24, 0, 100]  // [default, min, max]
```

### 2. Slider (auto-inferred)
```tsx
scale: 1.18  // auto-infers range based on value
```

### 3. Toggle
```tsx
visible: true
```

### 4. Spring (Time mode - simpler)
```tsx
spring: {
  type: 'spring',
  visualDuration: 0.3,
  bounce: 0.2,
}
```

### 5. Spring (Physics mode - more control)
```tsx
spring: {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 1,
}
```

### 6. Action Button
```tsx
reset: { type: 'action' }
next: { type: 'action', label: 'Next Slide' }
```

### 7. Select Dropdown
```tsx
theme: {
  type: 'select',
  options: ['light', 'dark', 'system'],
  default: 'system',
}
```

### 8. Color Picker
```tsx
backgroundColor: { type: 'color', default: '#3b82f6' }
// or auto-detected from hex string:
accentColor: '#3b82f6'
```

### 9. Text Input
```tsx
title: { type: 'text', default: 'Hello', placeholder: 'Enter title...' }
// or auto-detected from plain string:
label: 'Click me'
```

### 10. Folder (nested grouping)
```tsx
shadow: {
  offsetY: [8, 0, 24],
  blur: [16, 0, 48],
  opacity: [0.2, 0, 1],
}
```

## Output Format

Always generate complete, copy-paste ready code:

```tsx
import { useDialKit } from 'dialkit'
import { motion } from 'motion/react'

function ComponentName() {
  const params = useDialKit('ComponentName', {
    // Generated config here
  })

  return (
    <motion.div
      style={{
        // Apply params
      }}
      animate={{
        // Animate params
      }}
      transition={params.spring}
    />
  )
}
```

## Example Generations

### Request: "sliders for blur and opacity"
```tsx
const params = useDialKit('Effects', {
  blur: [0, 0, 100],
  opacity: [1, 0, 1],
})

// Usage:
style={{
  filter: `blur(${params.blur}px)`,
  opacity: params.opacity,
}}
```

### Request: "spring animation with scale"
```tsx
const params = useDialKit('Animation', {
  scale: [1, 0.5, 2],
  spring: {
    type: 'spring',
    visualDuration: 0.3,
    bounce: 0.2,
  },
})

// Usage:
animate={{ scale: params.scale }}
transition={params.spring}
```

### Request: "card with shadow controls"
```tsx
const params = useDialKit('Card', {
  borderRadius: [16, 0, 50],
  shadow: {
    offsetY: [8, 0, 24],
    blur: [16, 0, 48],
    opacity: [0.2, 0, 1],
  },
})

// Usage:
style={{
  borderRadius: params.borderRadius,
  boxShadow: `0 ${params.shadow.offsetY}px ${params.shadow.blur}px rgba(0,0,0,${params.shadow.opacity})`,
}}
```

### Request: "controls with actions"
```tsx
const params = useDialKit('Slideshow', {
  autoPlay: true,
  interval: [3, 1, 10],
  next: { type: 'action' },
  prev: { type: 'action' },
  reset: { type: 'action' },
}, {
  onAction: (action) => {
    if (action === 'next') goNext()
    if (action === 'prev') goPrev()
    if (action === 'reset') reset()
  },
})
```

## Tips for Generation

1. **Infer panel name** from component name or context
2. **Group related controls** in nested objects (folders)
3. **Use Time mode springs** by default (simpler for most users)
4. **Include usage comments** showing how to apply each param
5. **Match user's coding style** if they shared code

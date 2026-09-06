# Optional Image Lightbox Design

## Context

The site renders local MDX images through `BasicImage.astro` and commonly arranges them with `GridColumns.astro`. Images are currently static. The Machines for the Mental Load note needs a lightbox for its speculative advertisement grid without enabling lightboxing for the historical advertisements or any existing images elsewhere on the site.

The site uses Astro 5 and Astro's `ClientRouter`. The lightbox must therefore work after client-side page transitions without duplicating event handlers or leaving stale modal state behind.

## Goals

- Make lightboxing opt-in at either the grid or individual-image level.
- Treat an enabled grid as a navigable image gallery.
- Morph the selected thumbnail from its rendered grid position into a large modal image.
- Preserve the site's visual character with a pale, washed-out backdrop, rounded images, soft shadows, and restrained motion.
- Provide complete pointer, keyboard, and touch interaction.
- Reuse an existing visible `showalt` caption when one exists.
- Leave all existing images unchanged unless their MDX explicitly opts in.

## Non-goals

- Pinch-to-zoom or image panning.
- Download, share, or fullscreen-browser controls.
- Deep links to a particular gallery item.
- Lightboxing `RemoteImage`, video, or arbitrary embedded media.
- A general-purpose modal framework.

## Public MDX API

Enable every `BasicImage` in a grid and group the images as one gallery:

```mdx
<GridColumns lightbox>
	<BasicImage src="/images/example-one.png" alt="..." />
	<BasicImage src="/images/example-two.png" alt="..." />
</GridColumns>
```

Enable a single standalone image:

```mdx
<BasicImage lightbox src="/images/example.png" alt="..." />
```

The `lightbox` props default to `false`. A standalone `BasicImage lightbox` is a one-image gallery and does not gain navigation controls. The first implementation will not expose custom gallery identifiers; grouping is provided by an enabled `GridColumns` instance.

For `mental-load.mdx`, only the speculative-advertisement grid receives `lightbox`. The historical-advertisement grid remains static.

## Architecture

### `ImageLightbox.astro`

A new component renders one native `<dialog>` and its controls near the end of `Layout.astro`. It contains a small vanilla JavaScript custom-element controller. No React or Preact island and no new package are required.

The dialog's native `::backdrop` remains transparent. A full-viewport visual backdrop inside the dialog provides the white wash, paired animation, and explicit backdrop click target. This avoids relying on browser-specific pseudo-element animation behaviour while retaining native dialog modality.

The controller is dormant on pages without opted-in images. It uses delegated events rather than attaching a permanent listener to every image. Its lifecycle is owned by the custom element: listeners are registered with an `AbortController` in `connectedCallback` and removed in `disconnectedCallback`. It closes before an Astro page swap and works with newly rendered content after `astro:page-load`.

### `GridColumns.astro`

`GridColumns` gains an optional `lightbox` prop. When enabled, it renders a `data-lightbox-gallery` marker. The controller treats all descendant `BasicImage` elements as ordered members of that gallery. DOM order determines previous and next order.

The marker does not change layout or image styling by itself.

### `BasicImage.astro`

`BasicImage` gains an optional `lightbox` prop and a stable `data-basic-image` marker. When the prop is enabled, it also renders a standalone lightbox marker.

The controller enhances only enabled `.image-wrapper` elements with:

- `role="button"`
- `tabindex="0"`
- `aria-haspopup="dialog"`
- an accessible name derived from the image alt text

Enhancement happens only when JavaScript is active, so the no-JavaScript experience remains an ordinary image rather than a non-functional button. Only the image wrapper is a trigger; caption and source links remain independently clickable.

The controller reads the rendered `<picture>` and `<img>` rather than reconstructing Astro's image pipeline. The initial morph uses the thumbnail's selected `currentSrc`. The modal stage clones the rendered picture sources and adjusts their `sizes` value for the viewport so the browser can select an appropriate larger asset.

### Gallery state

The controller stores only transient state:

- the current gallery element, if any;
- the ordered enabled image wrappers;
- the active index;
- the trigger that opened or most recently represented the active image;
- the page's previous scroll-lock styles.

Moving between images updates the active index, image, alt text, optional caption, position announcement, and close-morph target.

## Interaction Design

### Discoverability

On fine-pointer hover, enabled images show a `zoom-in` cursor, rise by approximately 2px, and scale to approximately `1.015`. A small black circular badge with a white expand icon fades into the image's top-right corner. Keyboard focus shows the same badge and the site's standard visible focus treatment. Hover-only effects are not applied on touch devices.

### Opening

Pointer click, Enter, or Space opens an enabled image. The controller:

1. Measures the visible thumbnail rectangle.
2. Opens the native dialog and locks background scrolling.
3. Calculates the largest uncropped destination rectangle that fits the image within the viewport.
4. Animates a visual clone from the thumbnail rectangle to that destination using a FLIP transform.
5. Fades in the white backdrop with the same timing.
6. Reveals the modal's responsive picture when the morph completes.

The original thumbnail remains in place, avoiding layout movement in the article.

### Lightbox presentation

- The backdrop uses approximately `rgba(255, 255, 255, 0.65)` so the page is washed out rather than darkened.
- The content gutter is `clamp(12px, 3vw, 32px)`.
- The image is never cropped and never exceeds the available viewport width or height.
- The existing image border radius is preserved.
- A soft, broad shadow similar to `0 24px 80px rgba(34, 28, 20, 0.28)` separates the image from the backdrop.
- The close control is a white X in a black circle, inset 12px from the displayed image's top-right corner.
- Previous and next controls are white arrows in black circular buttons positioned at the image's left and right sides.
- Interactive controls have at least a 44px hit target even if their visible circles are smaller.
- On narrow screens, controls remain inside the viewport and may overlap the image edge rather than forcing the image off-screen.

### Captions

When the source `BasicImage` rendered a figcaption through `showalt`, the lightbox clones and displays that caption below the image, including any source link. Images without a rendered figcaption have no caption area. The image fitting calculation reserves space for a caption only when one exists.

### Navigation

Multi-image galleries can be navigated with:

- previous and next buttons;
- Left and Right Arrow keys;
- a horizontally dominant touch swipe that passes a deliberate movement threshold.

Navigation wraps between the first and last items. A stable modal stage prevents controls from jumping when images have different aspect ratios. The outgoing and incoming images use a short directional slide and crossfade. A polite live region announces the active position as, for example, "Image 3 of 7."

### Closing

The X button, Escape, and a click directly on the pale backdrop close the lightbox. Clicking the image, caption, or controls does not close it.

Closing reverses the FLIP morph into the thumbnail for the currently displayed image, then closes the dialog, restores background scrolling, and returns focus to that trigger. If the thumbnail is unavailable, outside the viewport, or cannot be measured, the image uses a short fade-and-scale exit instead.

## Motion Specification

| Interaction | Duration and easing | Properties |
| --- | --- | --- |
| Thumbnail hover/focus | 150ms `ease` | `transform`, badge `opacity` |
| Open morph | 240ms `cubic-bezier(0.215, 0.61, 0.355, 1)` | `transform`, `opacity` |
| Backdrop entrance | Paired with open morph | `opacity` |
| Previous/next | 170ms ease-in-out | `transform`, `opacity` |
| Close morph | 190ms ease-out | `transform`, `opacity` |

The implementation avoids animating layout dimensions. With `prefers-reduced-motion: reduce`, hover movement, morphing, backdrop transitions, and navigation transitions are all removed; state changes happen immediately.

## Accessibility

- Use `dialog.showModal()` for native modality and background inertness.
- Give the dialog an accessible "Image viewer" name.
- Give close, previous, and next buttons explicit accessible names.
- Put initial focus on the close button without showing a pointer-only focus ring.
- Restore focus to the active thumbnail on close.
- Retain the original image alt text in the modal.
- Hide previous and next controls for one-image galleries.
- Keep every control keyboard-operable and visibly focusable.
- Prevent vertical-page scrolling while the dialog is open and restore the prior state exactly on close.
- Treat a mostly vertical touch gesture as page intent rather than gallery navigation.

## Failure and Fallback Behaviour

- Without JavaScript, opted-in images render and behave like ordinary images.
- If an enlarged asset cannot decode, the modal uses the already rendered thumbnail source.
- If the Web Animations API is unavailable, the dialog changes state without morphing.
- If the active thumbnail cannot be measured during close, use the fade-and-scale fallback.
- If the viewport changes size or orientation while open, refit the active image and keep controls within the viewport.
- A page transition closes and cleans up the dialog before new content replaces the current page.

## Verification and Acceptance Criteria

### Automated checks

- Extend the repository's Node test suite with source-level checks for the dialog's accessible structure, named controls, reduced-motion handling, and Astro lifecycle hooks.
- Compile the edited Astro components to catch template or script syntax failures.
- Run the local production build after implementation.

### Browser checks

Verify the feature at desktop and mobile widths:

1. Existing images and the historical-advertisement grid remain non-interactive.
2. The speculative grid shows hover/focus affordances and opens from pointer, Enter, and Space.
3. The selected thumbnail morphs into the correct fitted image without cropping.
4. Previous/next buttons, arrow keys, and touch swipes navigate in DOM order and wrap.
5. X, Escape, and backdrop clicks close; image, caption, and control clicks do not.
6. Closing morphs to the active thumbnail and restores focus.
7. `showalt` captions appear with working source links; images without `showalt` have no caption area.
8. Focus remains inside the modal, controls meet touch-target expectations, and the page does not scroll behind it.
9. Reduced-motion mode removes every transition.
10. Navigating away and back through Astro view transitions does not duplicate handlers or leave stale state.

## Delivery Slices

1. **Opt-in foundation:** add component markers and the accessible single-image dialog flow without enabling it on existing content.
2. **Gallery and motion:** add FLIP opening/closing, navigation controls, keyboard/swipe behaviour, captions, fallbacks, and reduced motion.
3. **Mental-load integration and verification:** enable the speculative grid, add automated checks, and complete desktop/mobile browser verification.

Each slice remains opt-in and does not change the behaviour of existing images.

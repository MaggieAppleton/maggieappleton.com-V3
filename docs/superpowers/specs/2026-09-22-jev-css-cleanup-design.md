# Jev CSS Cleanup Design

## Goal

Replace the 377-line mixed-purpose `jev.css` file with a small shared foundation and feature-owned stylesheets. Remove dead rules, use the site design system for visual decisions, and preserve the current behavior and appearance of every live Jev experiment.

## Scope

The cleanup covers:

- Shared Jev foundations and controls.
- The sandwich scroll sorter.
- Spectrum navigation.
- Semantic search.
- Typed relationship graph.
- Epistemic linter.
- Garden-tending report.
- The playground's dependency on shared Jev foundations.

The feature does not change markup, interaction behavior, animation choreography, data, or authored article copy.

## Current Problems

`jev.css` currently mixes:

- Shared color aliases, typography defaults, controls, fields, metadata, empty states, inspectors, and source links.
- Styles for several independent experiments.
- Sorter-specific sticky layout and reduced-motion behavior.
- Responsive rules for unrelated features in shared media queries.
- Obsolete pipeline styles from an earlier playground implementation.
- Values that duplicate global spacing, typography, color, leading, radius, and shadow tokens.

This makes selector ownership unclear and encourages arbitrary values because each feature cannot express its own small set of intentional exceptions.

## Architecture

Keep `jev.css` as the shared foundation imported by `JevExperimentMount.astro`. It contains only:

- The `.jev` scope and feature-specific semantic color variables.
- Box sizing.
- Shared section heading structure.
- Shared form controls, buttons, fields, metadata, errors, links, empty states, sources, inspectors, probability rows, and reusable detail layouts.
- Shared mobile adjustments used by more than one experiment.
- The global Jev reduced-motion transition override.

Create feature-owned stylesheets:

- `sorter.css`
- `spectrum-navigation.css`
- `semantic-search.css`
- `relationship-graph.css`
- `epistemic-linter.css`
- `tending-report.css`

Keep the existing `playground.css`, but tokenise it and remove any rules now supplied by the shared foundation.

Each Astro mount imports its feature stylesheet. This keeps pure React modules compatible with the Node test runner while ensuring Astro bundles only the styles needed by the canonical Jev garden article. Existing class names remain unchanged, so CSS ownership changes without JSX markup churn.

## Dead Code Removal

Delete the obsolete pipeline block:

- `.jev-pipeline`
- `.jev-stages`
- `.jev-stage-*`
- `.jev-pipeline-*`

The current `Pipeline.jsx` renders the playground classes defined in `playground.css`; it no longer renders these selectors.

Delete `.jev-distributions`, which has no live source usage. Preserve dynamically generated axis and epistemic-kind selectors even though their complete class names do not appear as static strings.

After extraction, run an orphan-selector scan and inspect every candidate before deletion so dynamic classes are not mistaken for dead code.

## Design-System Rules

Use global tokens directly for:

- Colors: `--color-*`
- Type: `--font-*` and `--font-size-*`
- Leading: `--leading-*`
- Spacing: `--space-*`
- Radius: `--border-radius-*`
- Shadows: `--box-shadow-*`

Remove fallback literals from aliases when the corresponding global token is guaranteed by `global.css`.

Feature-specific data colors may remain local semantic variables because they encode chart or annotation meaning rather than general UI decoration.

Hard-coded values may remain only when they are measurable component contracts or rendering geometry, including:

- The sorter's 800px maximum width, 48px viewport inset, 300vh scroll travel, and food/source geometry.
- Graph SVG/node geometry.
- Hairline borders and pixel-perfect annotation marks.
- Animation timing and transform measurements.
- Responsive breakpoints where no global breakpoint token exists.

Repeated feature geometry should be named with local custom properties rather than repeated as unrelated literals.

## Responsive and Accessibility Behavior

The cleanup preserves:

- Existing desktop and mobile layouts.
- One-row sorter buckets and exact flight landings.
- Keyboard focus styles and accessible form controls.
- Tooltip positioning and focus behavior.
- Reduced-motion sorter fallback.
- No-JavaScript sorter fallback.

No selector moves across feature boundaries unless it is shared by at least two live features.

## Validation

Automated validation:

- Existing focused Jev tests.
- Selector-presence tests updated to read the owning stylesheet.
- Orphan-selector scan across all Jev source files.
- `git diff --check`.
- Production compilation through the Jev client and server bundles.

Browser validation at desktop and 390px widths:

- Sandwich sorter card, sequential scroll motion, reverse motion, and reduced motion.
- Spectrum navigation.
- Semantic search.
- Typed relationship graph.
- Epistemic linter.
- Garden-tending report.
- Playground.

Compare bounding geometry and computed design tokens before and after extraction for representative elements. Any visual change must be an intentional token substitution, not an accidental cascade change.

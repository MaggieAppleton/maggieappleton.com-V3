# Internal Link Hover Previews

## Summary

Every navigational link to an internal page should show the same useful preview, regardless of whether the author wrote it as a Markdown route link such as `[Digital Gardening](/garden-history)` or a wiki link such as `[[Digital Gardening]]`.

The preview should show the destination title and, when available, its description. Internal pages without a description should show a title-only card. An unregistered internal page should receive a human-readable title derived from its pathname rather than exposing a bare route.

## Goals

- Give ordinary internal Markdown links and wiki links equivalent rich previews.
- Reuse a single source of preview metadata and a single visual presentation.
- Keep previews instant and deterministic with build-time data.
- Preserve existing link styling, external-link behavior, and navigation.
- Support pointer hover and keyboard focus.
- Continue working after Astro view transitions.

## Non-goals

- Fetching or parsing destination HTML when a visitor hovers.
- Providing rich previews for external links.
- Previewing same-page fragments, downloads, feeds, API routes, or other non-page targets.
- Curating descriptions for every static route as part of this change.
- Redesigning link colours, underlines, or the overall tooltip visual language.

## Architecture

### Preview metadata index

Extend the existing link-generation pipeline to produce a route-keyed preview index. Each entry has:

- a canonical pathname;
- a display title;
- an optional description;
- aliases where needed for wiki-link resolution.

Content routes derive their metadata from the existing essay, note, pattern, and talk frontmatter. Static pages may contribute metadata through a small explicit map. Routes without a supplied description remain valid title-only entries.

The generated index is the shared source of truth for both wiki-link resolution and runtime route lookup. It is created before Astro starts or builds, following the current `generate-links` workflow.

### URL classification and normalization

A shared helper classifies a link as external, an internal page, or an excluded internal target. For internal pages it creates a lookup key by:

1. accepting root-relative, relative, and same-origin absolute URLs;
2. removing the query string and fragment;
3. normalizing duplicate and trailing slashes;
4. resolving the result to a canonical pathname.

Same-page fragments, file downloads, feed formats, and API endpoints are excluded from rich previews. External links retain their existing behavior.

### Shared preview presentation

Use one internal preview presentation for both link syntaxes. It renders:

- the destination title;
- the description only when non-empty;
- the existing white card, arrow, shadow, and typography.

Ordinary Markdown links continue through the global `a: TooltipLink` MDX component mapping. When `TooltipLink` identifies an internal page, it looks up normalized preview metadata and renders the shared internal card. Wiki links continue resolving aliases in the remark plugin, then pass the canonical destination to the same preview presentation.

The existing Tippy setup remains responsible for positioning, hover/focus triggers, interactive content, and reinitialization after `astro:page-load`.

## Preview fallback order

For an internal page link:

1. Use indexed title and description when both exist.
2. Use the indexed title when the description is absent.
3. If the route is not indexed, derive a readable title from the final pathname segment by decoding it, replacing hyphens and underscores with spaces, and title-casing the result.
4. If no meaningful title can be derived, render a normal link without a preview.

This fallback must never change or block the destination URL.

## Interaction and accessibility

- Pointer hover and keyboard focus reveal the same preview content.
- Link semantics remain native anchors.
- Existing visible focus styles remain intact.
- Preview content stays interactive where Tippy currently allows it.
- Reduced-motion preferences disable or substantially shorten the shift animation.
- Touch interaction must not prevent normal navigation.

## Error handling

Preview enhancement is non-critical. Missing metadata or an unsupported URL shape leaves a functional link in place.

The generator should fail clearly for malformed preview records that would make the generated index invalid. Runtime URL normalization should reject unsupported protocols and invalid destinations without throwing during page interaction.

No network requests occur when opening a preview, so network failures cannot create a broken or delayed hover state.

## Verification

Automated coverage should verify:

- generated metadata for canonical content routes and wiki aliases;
- classification of relative, root-relative, same-origin absolute, and external URLs;
- normalization of query strings, fragments, and trailing slashes;
- exclusion of same-page fragments, assets, feeds, and API routes;
- rich, title-only, pathname-derived, and no-preview fallbacks;
- equivalent preview content for Markdown route links and wiki links;
- the production build succeeds.

Browser verification should confirm:

- `[label](/route)` and `[[wiki link]]` display equivalent cards;
- previews appear on pointer hover and keyboard focus;
- links still navigate normally;
- previews still work after an Astro view transition;
- reduced-motion preferences avoid the standard shift animation;
- external links retain their current URL tooltip.

## Scope

Implementation is limited to the generated link metadata, URL classification and normalization, shared internal preview rendering, the existing Markdown and wiki-link integration points, and directly related tests or documentation.

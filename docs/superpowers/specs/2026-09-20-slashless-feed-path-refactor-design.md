# Slashless Feed Path Refactor Design

## Goal

Keep the slashless feed-link invariant in one place without changing any RSS
URL output.

## Design

Add a small `toFeedPath(slug)` helper in `feedPublication.mjs`. It accepts the
route slug supplied by each feed-item builder, makes it root-relative, and
delegates trailing-slash removal to `normalizeCanonicalPath`.

All four feed-item builders call this helper. Ordinary publication and
Smidgeon builders continue to derive their slug through `getFeedSlug`; the Now
builder continues to use `now-${post.id}`. No external, image, citation, or
channel URLs pass through the helper.

## Verification

Update the focused structural test to require one normalization point and four
helper call sites. Existing behavioral tests must continue to prove the exact
slashless links, folder-version handling, filename-version preservation, RSS
serialization, draft filtering, and ordering.


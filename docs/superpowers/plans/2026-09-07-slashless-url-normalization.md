# Slashless URL Normalization Implementation Plan

> **Programme:** P3 of the SEO/AEO programme. Base is the reviewed P2 commit
> `a9f4e751f45cb6b65fc7a6e19f6611b444598487`. P2 owns canonical identity;
> P4 owns sitemap and robots membership.

## Outcome

Public routes have one slashless identity. On Vercel, a single trailing slash
permanently redirects to the slashless path in one hop, while `/` remains `/`.
Astro, feeds, canonical/Open Graph metadata, Wiki links, navigation, version
links, and backlinks agree on the destination.

## Observed baseline

- `astro.config.mjs` does not declare `trailingSlash`, so Astro uses `ignore`.
- `vercel.json` contains headers only and does not enforce URL normalization.
- A local no-follow probe at exact P2 returned 200 for `/about/`,
  `/about/?x=1`, and `/rss.xml/`; `/` also returned 200.
- P2 already makes canonical and `og:url` values slashless.
- Main/mobile navigation, cards, topics, Wiki links, and version links already
  generate slashless route paths.
- Four feed item builders still append a final slash.
- Backlinks currently emit bare slugs. They happen to resolve from root pages
  but can resolve relative to a nested or version-archive URL.

## Scope boundaries

- Do not add a sitemap or change robots membership; P4 owns those.
- Do not change canonical identity or Open Graph selection; P2 owns those.
- Do not rewrite authored external URLs, fragments, citations, asset URLs,
  XML endpoint names, or remote media.
- Preserve the historical slashful and slashless target variants used to match
  incoming Webmentions; those are compatibility lookups, not generated links.
- Do not add a catch-all application redirect route or hand-written Vercel
  regex. The platform `trailingSlash` setting owns the permanent redirect.
- Do not claim local Astro dev proves Vercel status semantics. With
  `trailingSlash: "never"`, Astro dev rejects a slashful route; Vercel owns the
  deployed 308.
- Do not run a full image build. P3 changes routing configuration and text URL
  output, not source images or image generation.

## URL contract

1. `/` remains `/` and returns 200.
2. A request such as `/about/` receives one permanent 308 to `/about` on
   Vercel.
3. A query-bearing request such as `/about/?source=smoke` preserves its query
   in the redirect destination.
4. The slashless destination returns 200 and its P2 canonical equals the public
   slashless URL.
5. Unknown slashful paths may normalize once and then return 404; P3 does not
   make them indexable.
6. Repeated trailing slashes are not part of the one-hop acceptance claim.
7. Feed item links and generated internal page links use `/path`, not `/path/`.
8. Root-relative endpoints such as `/rss.xml`, assets, and fragments keep their
   existing spelling. The platform may still normalize a requested trailing
   slash after an endpoint name.

## Task 0: Declare the routing contract

**Files:**

- Modify: `astro.config.mjs`
- Modify: `vercel.json`
- Create: `tests/slashless-routing.test.mjs`
- Modify: `README.md`

### RED configuration tests

Assert that:

- Astro declares `trailingSlash: "never"` at the top level;
- Vercel declares top-level JSON boolean `"trailingSlash": false`;
- no hand-authored `redirects` or `routes` entry is added; the first-class
  `trailingSlash` property is the only authored redirect declaration;
- the configured site remains `https://maggieappleton.com`;
- README keeps the evidence boundary: the fast verifier checks local
  destinations, while deployed redirect behavior needs a Vercel smoke test.

Run RED:

```bash
node --test tests/slashless-routing.test.mjs
```

### Implement

Add `trailingSlash: "never"` to Astro and `"trailingSlash": false` to Vercel.
Keep the existing Vercel headers unchanged. Update the README verifier note
with the P3 boundary and point to this plan's exact smoke checklist. Preserve
the existing requirement to run `npm run build:local` immediately before a
separately authorized deployment; P3 skips the repeated full build only for
this routing/text-only PR.

### Verify

```bash
node --test tests/slashless-routing.test.mjs
npm run verify:html
npx astro check
git diff --check
```

The normal 18-route verifier must remain green on slashless paths and must not
request images. It must not pretend Astro dev's slashful 404 is a Vercel 308.

### Commit

```bash
git add astro.config.mjs vercel.json README.md tests/slashless-routing.test.mjs
git commit -m "fix: declare slashless routes"
```

## Task 1: Make feed item URLs slashless

**Files:**

- Modify: `src/utils/feedPublication.mjs`
- Modify: `tests/publication-policy.test.mjs`
- Modify: `tests/slashless-routing.test.mjs`

### RED feed tests

Update and extend feed-builder expectations so that:

- ordinary publication items use `/slug`;
- true folder versions use their base `/slug` identity;
- ordinary filename versions such as `/api-v1` and `/api-v2` stay distinct;
- Now uses `/now-id` without a trailing slash;
- the live-shaped Now fixture uses an extensionless ID such as `2026-02` and
  expects `/now-2026-02`; an optional nested fixture may use
  `2026-02/updates` -> `/now-2026-02/updates`;
- both the main and standalone Smidgeon feeds use `/slug`;
- drafts remain absent and ordering/content behavior is unchanged;
- no generated feed item link except `/` ends with `/`.

### Implement

Import P2's `normalizeCanonicalPath` into `feedPublication.mjs` and pass each of
the four root-relative feed route paths through it. This makes the P2 identity
contract explicit and avoids a second URL-normalization implementation. Do not
apply it to external citation URLs or image references.

### Verify and commit

```bash
node --test tests/publication-policy.test.mjs tests/slashless-routing.test.mjs
node --test tests/*.test.mjs
git diff --check
git add src/utils/feedPublication.mjs tests/publication-policy.test.mjs tests/slashless-routing.test.mjs
git commit -m "fix: publish slashless feed links"
```

## Task 2: Make backlinks root-relative and slashless

**Files:**

- Modify: `src/components/layouts/Backlinks.astro`
- Modify: `tests/slashless-routing.test.mjs`

### RED link-contract tests

Assert that:

- `Backlinks.astro` imports and uses the shared path normalizer;
- generated backlink slugs become explicit root-relative paths;
- nested and folder-version paths remain slashless;
- `src/links.json` contains non-empty slugs with no leading or trailing slash;
- Wiki links, primary navigation, cards, topics, and version navigation retain
  their already-slashless behavior;
- Webmention lookup variants remain untouched.

### Implement

Generated link-map slugs intentionally have no leading slash. Prepend `/`, then
normalize `/${backlink.slug}` at the Backlinks consumer before assigning the
anchor `href`. Do not change the generated link-map schema or the Webmention
compatibility lookup.

### Verify and commit

```bash
node --test tests/slashless-routing.test.mjs
node --test tests/*.test.mjs
npx astro check
git diff --check
git add src/components/layouts/Backlinks.astro tests/slashless-routing.test.mjs
git commit -m "fix: root backlink URLs"
```

## Task 3: Branch-wide verification and deployment evidence

### Local gates

```bash
node --test tests/*.test.mjs
npm run generate-links
npx tsx src/scripts/generate-topics.ts
npm run verify:html
npx astro check
git diff --check a9f4e75..HEAD
git status --short
```

Require clean generated output, all slashless destination routes green, no
image requests, no owned listener, and a clean worktree.

### Independent reviews

Request two fresh read-only reviews:

1. specification review of root behavior, one-hop permanent redirect contract,
   query preservation, canonical agreement, feeds, and P4 boundaries;
2. code-quality review of Astro/Vercel configuration, feed/version identities,
   backlink resolution, false-positive tests, and unintended URL rewrites.

Fix every Critical or Important finding through an implementer/re-review loop.

### Preview smoke after the PR creates a Vercel preview

Use manual/no-follow requests and do not request image routes:

- `/about/` -> one 308 with slashless `Location`;
- `/topics/web-development/` -> one 308 with slashless `Location`;
- `/now-2026-08/` -> one 308 with slashless `Location`;
- `/about/?source=smoke` -> one 308 whose `Location` preserves the query;
- `/` -> 200 with no `Location`;
- each slashless destination -> 200 and its canonical agrees with the public
  production URL.

For every redirect case, require source status exactly 308 and verify the
single `Location` target directly returns 200 rather than another 3xx. If an
optional `vercel dev` diagnostic is used, record that the installed CLI may
return 301 locally; skip it if it asks to link the project or create `.vercel`.
Preview is the authoritative pre-production 308 check.

If Vercel preview behavior differs from production-domain behavior, record the
difference and retain the production smoke as pending. Do not deploy or change
project linkage to manufacture evidence.

### Production smoke after separately approved deployment

Repeat the same no-follow checks on `https://maggieappleton.com`. Optionally
and non-blockingly check `/rss.xml/`, `/smidgeons.xml/`, and `/robots.txt/`;
endpoint names with extensions may differ across provider handling. Do not request
`/_image/` or `/og/*.png/`. This remains pending until merge/deploy authority is
given.

### Open stacked PR

Push `codex/seo-aeo-slashless` and open it against
`codex/seo-aeo-canonical-source`. Record:

- exact base SHA `a9f4e75`;
- dependency on PR #247;
- eventual target `main`, oldest-first;
- local test, generator, 18-route no-image verifier, and Astro results;
- Vercel preview smoke results and production smoke still pending;
- no merge or deploy authorization.

Suggested title: `SEO: normalize slashless URLs`

## Completion checklist

- [ ] Astro declares slashless route generation.
- [ ] Vercel declares permanent slash removal.
- [ ] Root remains `/`.
- [ ] Feed item links are slashless without collapsing ordinary `-vN` names.
- [ ] The four observed feed producers remain the only known former
      trailing-slash generators; already-compliant URL producers have
      regression coverage.
- [ ] Backlinks are explicit root-relative slashless paths.
- [ ] Canonical and Open Graph destinations remain aligned.
- [ ] External URLs, assets, fragments, XML names, and Webmention compatibility
      lookups are not rewritten.
- [ ] Local gates and two independent reviews are clean.
- [ ] Preview redirect behavior is recorded without requesting images.
- [ ] Production smoke is explicitly pending deployment approval.
- [ ] Stacked PR is open; nothing is merged or deployed.

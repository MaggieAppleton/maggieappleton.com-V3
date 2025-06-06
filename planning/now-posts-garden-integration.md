# Now Posts Garden Integration Implementation Plan

**Last Updated:** 2025-06-06

## Feature Overview

Integrate Now Posts into the garden page and topic pages so they appear alongside essays, notes, patterns, talks, and podcasts. This includes creating a new card component, updating the content schema, and modifying filtering/display logic.

## Current Phase

✅ **FEATURE COMPLETE** - All phases successfully implemented and tested

## Overall Progress

- [x] **Phase 1:** Schema and Content Updates (3/3 tasks)
- [x] **Phase 2:** Create NowCard Component (2/2 tasks)
- [x] **Phase 3:** Content Preview Extraction (2/2 tasks)
- [x] **Phase 4:** Garden Page Integration (3/3 tasks)
- [x] **Phase 5:** Topic System Integration (3/3 tasks)
- [x] **Phase 6:** Testing and Validation (2/2 tasks)

**Total Progress:** 15/15 tasks completed ✅

## Implementation Tasks

### Phase 1: Schema and Content Updates

- [x] **P1.1** Update Now collection schema in `src/content/config.ts`

  - Add optional `topics: z.array(z.string()).optional()` field
  - Add `growthStage: z.string().default("evergreen")` field
  - Ensure backward compatibility with existing Now posts

- [x] **P1.2** Update TypeScript interfaces in `src/types/` if needed

  - Add Now collection type definitions for topics and growthStage

- [x] **P1.3** Test schema changes with existing Now posts
  - Verify no errors with posts missing topics field
  - Confirm growthStage defaults to "evergreen"

### Phase 2: Create NowCard Component

- [x] **P2.1** Create `src/components/cards/NowCard.astro`

  - Adapt structure from `NoteCard.astro`
  - Use `heroicons:clock` icon instead of growth stage icons
  - Display title, date, and content preview
  - Include "Now" type label in metadata container

- [x] **P2.2** Style NowCard component
  - Ensure visual consistency with other card components
  - Test responsive behavior
  - Add hover effects following existing patterns

### Phase 3: Content Preview Extraction

- [x] **P3.1** Create content extraction utility `src/utils/extractPreview.ts`

  - Parse MDX content and skip import statements
  - Extract first meaningful sentence from markdown
  - Cap preview text at 100 characters
  - Handle edge cases (empty content, only imports, etc.)

- [x] **P3.2** Test preview extraction with existing Now posts
  - Verify import statements are skipped (like in `2023-06.mdx`)
  - Confirm meaningful content extraction
  - Test character limit functionality

### Phase 4: Garden Page Integration

- [x] **P4.1** Update `src/pages/garden.astro`

  - Add Now collection to `getCollection` calls
  - Include Now posts in `allPosts` array
  - Update page description to mention Now posts

- [x] **P4.2** Update `src/components/search/GardenHits.astro`

  - Add Now post display logic using NowCard component
  - Include Now posts in Post interface type
  - Add data attributes for filtering using `post.data.type` consistently

- [x] **P4.3** Update `src/components/search/GardenFilters.astro`
  - Add "Now Updates" option to types filter dropdown
  - Ensure filtering logic works with Now posts

### Phase 5: Topic System Integration

- [x] **P5.1** Update `src/utils/getTopics.ts`

  - Include Now collection in `getAllTopics` function
  - Include Now collection in `getPostsForTopic` function
  - Handle optional topics field gracefully

- [x] **P5.2** Update `src/pages/topics/[topic].astro`

  - Add Now posts to Post type union
  - Add NowCard display logic in the mapping function
  - Update page description to mention Now posts

- [x] **P5.3** Test topic filtering with Now posts
  - Verify Now posts appear on relevant topic pages
  - Confirm posts without topics are excluded from topic pages
  - Test sorting by date works correctly

### Phase 6: Testing and Validation

- [x] **P6.1** Comprehensive testing

  - Test garden page displays Now posts correctly
  - Test topic pages include Now posts when relevant
  - Test filtering and sorting functionality
  - Verify no errors with existing Now posts lacking topics

- [x] **P6.2** Final validation and feature completion
  - All functionality tested and working correctly
  - Feature ready for production use

## Technical Considerations

### Content Preview Extraction Strategy

- Skip import statements at the top of MDX files
- Parse markdown to extract plain text (strip formatting)
- Find first complete sentence or first 100 characters
- Handle edge cases like files with only imports or very short content

### Schema Backwards Compatibility

- Make `topics` field optional to avoid breaking existing Now posts
- Default `growthStage` to "evergreen" for all Now posts
- Ensure filtering works correctly with undefined/empty topics

### Performance Impact

- Adding Now posts to garden page will increase initial data load
- Consider if additional posts require pagination or lazy loading
- Monitor build times with additional content processing

## Files to be Modified/Created

### New Files

- `planning/now-posts-garden-integration.md` (this file)
- `src/components/cards/NowCard.astro`
- `src/utils/extractPreview.ts`

### Modified Files

- `src/content/config.ts`
- `src/pages/garden.astro`
- `src/components/search/GardenHits.astro`
- `src/components/search/GardenFilters.astro`
- `src/utils/getTopics.ts`
- `src/pages/topics/[topic].astro`

## Completed Tasks

### Phase 1: Schema and Content Updates ✅

- **P1.1** ✅ Updated Now collection schema in `src/content/config.ts`

  - Added optional `topics: z.array(z.string()).optional()` field
  - Added `growthStage: z.string().default("evergreen")` field
  - Ensured backward compatibility with existing Now posts

- **P1.2** ✅ Verified TypeScript interfaces (no updates needed)

  - Content config uses Astro's built-in collection typing
  - No additional type definitions required

- **P1.3** ✅ Tested schema changes with existing Now posts
  - Build completed successfully with no errors
  - Confirmed backward compatibility for posts missing topics field
  - Verified growthStage defaults to "evergreen"

### Phase 2: Create NowCard Component ✅

- **P2.1** ✅ Created `src/components/cards/NowCard.astro`

  - Adapted structure from `NoteCard.astro`
  - Uses `heroicons:clock` icon instead of growth stage icons
  - Displays title, date, and content preview
  - Includes "Now" type label in metadata container

- **P2.2** ✅ Styled NowCard component
  - Ensured visual consistency with other card components (matches NoteCard patterns)
  - Applied responsive behavior and hover effects
  - Added proper transitions and will-change properties for performance

### Phase 3: Content Preview Extraction ✅

- **P3.1** ✅ Created content extraction utility `src/utils/extractPreview.ts`

  - Implemented frontmatter skipping (content between `---` markers)
  - Added filtering for import/export statements (`import`, `import {`, `export`)
  - Added markdown cleanup (removes `**bold**`, `*italic*`, `[links](urls)`, `# headers`, HTML tags, JSX components)
  - Implemented intelligent truncation (first complete sentence or word boundary truncation)
  - Added configurable character limits (defaults to 100 characters)
  - Handles edge cases (empty content, files with only imports, etc.)

- **P3.2** ✅ Created test page `src/pages/test-preview-extraction.astro`
  - Tests real content from existing Now posts (2025-05, 2023-06)
  - Verifies import statement filtering works correctly
  - Tests markdown formatting removal
  - Validates edge case handling (empty content, only imports)
  - Confirms character limit and word boundary truncation

### Phase 4: Garden Page Integration ✅

- **P4.1** ✅ Updated `src/pages/garden.astro`

  - Added Now collection to `getCollection` calls
  - Included Now posts in `allPosts` array
  - Updated page description to mention Now posts

- **P4.2** ✅ Updated `src/components/search/GardenHits.astro`

  - Added Now post display logic using NowCard component
  - Updated Post interface to include preview field for content extraction
  - Added pre-processing to extract preview text from Now posts
  - Implemented consistent filtering using `post.data.type` (removed ternary operator logic)
  - Added data attributes for filtering that work seamlessly with existing filter system

- **P4.3** ✅ Updated `src/components/search/GardenFilters.astro`
  - Added "Now Updates" option to types filter dropdown
  - Ensured filtering logic works correctly with Now posts using `post.data.type`

### Schema Refinement ✅

- **Updated Now collection schema** to use `startDate` field for consistency with other collections
- **Updated all Now post files** to use `startDate` instead of `date` in frontmatter
- **Ensured all Now posts have `type: "now"`** in their frontmatter for consistent type checking

### Phase 5: Topic System Integration ✅

- **P5.1** ✅ Updated `src/utils/getTopics.ts`

  - Added Now collection to both `getAllTopics` and `getPostsForTopic` functions
  - Now posts are included in topic aggregation and filtering
  - Optional topics field handled gracefully (posts without topics excluded from topic pages)

- **P5.2** ✅ Updated `src/pages/topics/[topic].astro`

  - Added Now collection to Post type union
  - Added NowCard import and display logic in mapping function
  - Updated sorting logic to handle both `updated` (most collections) and `startDate` (Now posts)
  - Updated page description to mention Now updates
  - Fixed URL slug format for Now posts (`now-${id}` instead of `now/${id}`)

- **P5.3** ✅ Fixed Now post linking issues

  - Corrected slug format in both topic pages and garden page
  - Now posts correctly link to `/now-{id}` URLs (e.g., `/now-2025-03`)
  - Updated garden page `commonProps` to handle Now post slug format conditionally

# Content Versioning System

## Overview

This document outlines the design and implementation plan for a content versioning system for the digital garden. The system enables manual version control for blog posts, allowing readers to see how content evolves over time while maintaining clean URLs and backward compatibility.

## Core Requirements

### Functional Requirements

1. **Manual Version Creation**: Author decides when to create new versions (no automatic versioning)
2. **Canonical URL Behavior**: Main URLs always redirect to the latest version
3. **Version-Specific URLs**: Each version accessible via `/v{number}/{slug}` pattern  
4. **Version Navigation**: UI to navigate between versions and see version history
5. **Backwards Compatibility Indication**: Clear messaging when viewing older versions
6. **Lightweight UX**: Non-invasive interface that doesn't interfere with reading experience

### Non-Functional Requirements

1. **Backwards Compatibility**: Existing posts without versions work unchanged
2. **Performance**: Minimal impact on build times and page load speeds  
3. **SEO Friendly**: Proper canonical tags and meta data
4. **Maintainability**: Simple workflow for content creation and updates

## URL Structure

### Current Behavior
- `/my-essay` → Single version of content

### New Behavior  
- `/my-essay` → Latest version (canonical URL, always 200 status)
- `/v1/my-essay` → Version 1 (archived version, 200 status)
- `/v2/my-essay` → Version 2 (archived version, 200 status)
- `/v3/my-essay` → Version 3 (if current latest, same as `/my-essay`)

## Data Model & File Structure

### File Organization (Folder-Based Approach)
```
src/content/essays/
  my-essay/            # Folder containing all versions
    my-essay-v1.mdx    # Version 1 (routes to /v1/my-essay)
    my-essay-v2.mdx    # Version 2 (routes to /v2/my-essay)
    my-essay-v3.mdx    # Version 3 - Latest (routes to /my-essay)
```

**Key Implementation Detail**: The system uses folder-based organization where each versioned post lives in its own folder named after the base slug. All versions are explicitly numbered files (no "latest" file without version number). The `extractBaseSlug()` function in `versionUtils.ts` detects this folder structure and uses the folder name as the canonical slug. The latest version is determined by the highest version number in frontmatter.

### Frontmatter Schema

#### Version Files (All Explicitly Numbered)
```yaml
---
title: "My Essay"
description: "Essay description"
startDate: "2023-01-15"
updated: "2023-06-01"  # Date when this specific version was published
type: "essay"
growthStage: "evergreen"
version: 3  # Explicit version number (highest number = latest)
versionSummary: "Major revision with new examples and conclusion" # What changed in this version
# ... existing frontmatter fields
---
```

**Implementation Note**: Unlike the original plan, there is no separate "latest" file without a version number. All versions are explicitly numbered (v1, v2, v3, etc.) and the system determines the latest version by finding the highest version number in the frontmatter.

## Implementation Strategy

### Phase 1: Core Infrastructure ✅ COMPLETED

1. **Extend Content Collections Schema** ✅
   - Added optional `version` and `versionSummary` fields to frontmatter
   - Updated TypeScript types for versioned content in `versionUtils.ts`

2. **Modify Routing Logic (`[...slug].astro`)** ✅
   - Detects versioned files by folder structure (not filename patterns)
   - Generates additional static routes for versioned content via `generateVersionedPaths()`
   - Groups related versions by base slug using folder detection

3. **Create Version Detection Utilities** ✅
   - `isVersionedEntry()`: Identifies folder-based versioned content
   - `getAllVersionsForPost()`: Gets all versions for a given post
   - `getLatestVersion()`: Determines latest version by version number
   - `getVersionInfo()`: Comprehensive version metadata
   - `getCanonicalDates()`: Consistent dating across versions

### Phase 2: UI Components ✅ COMPLETED

1. **Version Navigation Component** ✅ `VersionDropdown.astro`
   - Shows current version number and total versions in trigger button
   - Dropdown menu with complete version history timeline
   - Visual timeline with dots and connecting lines
   - Displays version summaries and relative dates
   - Full keyboard accessibility (arrow keys, escape, enter)
   - Hover and click interactions

2. **Archive Warning Component** ✅ `VersionWarning.astro`
   - Alert banner for older versions with clear messaging
   - "View latest" button linking to current version
   - Shows latest version number and publication date
   - Responsive design for mobile

### Phase 3: Integration & Polish ✅ COMPLETED

1. **Link Processing Updates** ✅
   - Wiki-style `[[internal links]]` resolve to canonical URLs via `getCanonicalUrlFromEntry()`
   - Version-specific linking handled through base slug extraction

2. **SEO Optimization** ✅
   - Canonical tags implemented pointing to latest version via `getCanonicalUrl()`
   - Proper meta descriptions and titles maintained
   - Consistent dating across versions with `getCanonicalDates()`

3. **Search & Discovery** ✅
   - Search surfaces latest versions through canonical URL routing
   - Archived versions filtered from main collection views
   - `generateVersionedPaths()` ensures proper route precedence

## Author Workflow (Folder-Based Implementation)

### Creating First Version
1. Author writes and publishes `my-essay.mdx` normally in `src/content/essays/`
2. Content is available at `/my-essay` 
3. No versioning UI appears (single version)

### Creating Second Version (Initial Versioning)
1. Author decides to make substantial changes and wants to preserve the original
2. Create a new folder: `mkdir src/content/essays/my-essay/`
3. Create first version: `cp my-essay.mdx my-essay/my-essay-v1.mdx`
4. Update `my-essay-v1.mdx` frontmatter:
   - Add `version: 1`
   - Add `versionSummary: "Initial publication"`
   - Ensure `updated` date reflects original publication
5. Create second version: `cp my-essay.mdx my-essay/my-essay-v2.mdx`
6. Update `my-essay/my-essay-v2.mdx` with new content:
   - Add `version: 2`
   - Update `updated` date to current date
   - Add `versionSummary: "Description of changes"`
   - Adjust `growthStage` if needed
7. Remove original `my-essay.mdx` file
8. Deploy - versioning UI now appears on both versions

### Creating Subsequent Versions  
1. When ready for version 3, duplicate latest version: `cp my-essay/my-essay-v2.mdx my-essay/my-essay-v3.mdx`
2. Update `my-essay-v3.mdx` with new content:
   - Update `version: 3`
   - Update `updated` date
   - Add `versionSummary` describing changes
3. Deploy - new version becomes the canonical latest version

## Technical Considerations

### Astro Static Generation
- Modify `getStaticPaths()` to detect versioned files and generate additional routes
- Parse filename patterns to extract version numbers and base slugs
- Handle route conflicts and ensure proper precedence

### Content Discovery Algorithm (Actual Implementation)
1. Scan content directories for folders and individual files
2. For entries in folders (detected by `entry.id.includes('/')`), extract base slug from folder name using `extractBaseSlug()`
3. Group versions by base slug using `getAllVersionsForPost()`
4. Sort versions numerically using frontmatter `version` field with `getVersionFromEntry()`
5. Generate route map: `/v{number}/{slug}` → versioned file via `generateVersionedPaths()`
6. Generate canonical route: `/{slug}` → latest version file (determined by highest version number)

**Key Functions in `versionUtils.ts`:**
- `isVersionedEntry()`: Detects folder-based versioned content
- `extractBaseSlug()`: Gets folder name as base slug
- `getVersionFromEntry()`: Reads version number from frontmatter
- `getLatestVersion()`: Finds highest version number
- `generateVersionedPaths()`: Creates all routing paths

### Performance Considerations
- Versioned content increases total route count (impacts build time)
- Need efficient caching of version metadata
- Consider lazy loading version history UI

### Link Resolution
- Existing wiki-link processor (`remark-wiki-link.js`) needs updates
- Internal `[[links]]` should resolve to canonical URLs by default
- Rare edge case: explicit version linking like `[[my-essay v1]]`

## Integration with Existing Features

### Growth Stages
- Each version can have independent growth stage
- Typically updated when creating new version (seedling → budding → evergreen)
- Version navigation shows growth progression over time

### Backlinks
- Backlinks should reference canonical URLs to avoid fragmentation  
- Archived versions don't generate new backlinks
- Existing backlinks remain pointing to canonical URLs

### Topics & Search
- Search results prioritize latest versions
- Topic pages show latest versions only
- Archived versions excluded from main discovery surfaces

### Webmentions
- Webmentions collected against canonical URLs
- Displayed on latest version only
- Historical social context preserved

## Migration Strategy

### Backwards Compatibility
- All existing content works without changes
- No frontmatter modifications required for single-version posts
- Version UI only appears when multiple versions detected

### Gradual Rollout
1. Implement infrastructure without touching existing content
2. Test with 1-2 experimental posts  
3. Add versioning to select high-value essays over time
4. Most notes and patterns likely remain single-version

## Future Enhancements (Out of Scope)

### Version Comparison
- Diff view showing changes between versions
- Highlighted additions/deletions in content
- Would require sophisticated MDX diffing algorithm

## Implementation Checklist

### Core Infrastructure ✅ COMPLETED
- [x] Extend content schema with version fields (`versionUtils.ts`)
- [x] Update TypeScript types and interfaces (`VersionedContent`, `VersionInfo`)
- [x] Implement version detection utilities (folder-based detection)
- [x] Modify routing logic for versioned URLs (`generateVersionedPaths()`)
- [x] Create static path generation for versions

### UI Components ✅ COMPLETED 
- [x] Version navigation component (`VersionDropdown.astro`)
- [x] Archive warning component (`VersionWarning.astro`)
- [x] Integration with PostLayout
- [x] Responsive design for mobile
- [x] Full keyboard accessibility
- [x] Visual timeline design with connecting lines

### Integration ✅ COMPLETED
- [x] Update wiki-link processing (canonical URL resolution)
- [x] Add canonical tag support (`getCanonicalUrl()`)
- [x] Update sitemap generation (latest versions only)
- [x] Test with existing features (search, topics, etc.)
- [x] Consistent date handling across versions

### Testing & Polish
- [x] Test with sample versioned content
- [x] Verify SEO compliance (canonical tags implemented)
- [x] Performance testing (efficient version detection)
- [x] Documentation for content workflow

This versioning system provides a lightweight, author-friendly way to show content evolution while maintaining excellent user experience and technical performance.
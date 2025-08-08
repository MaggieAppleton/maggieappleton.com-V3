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

### File Organization
```
src/content/essays/
  my-essay.mdx         # Latest version (routes to /my-essay)
  my-essay-v1.mdx      # Version 1 (routes to /v1/my-essay)  
  my-essay-v2.mdx      # Version 2 (routes to /v2/my-essay)
```

### Frontmatter Schema

#### Latest Version File
```yaml
---
title: "My Essay"
description: "Essay description"
startDate: "2023-01-15"
updated: "2023-06-01"
type: "essay"
growthStage: "evergreen"
version: 2
versionSummary: "Description of changes made in version 2" # Optional: what changed in this version
# ... existing frontmatter fields
---
```

#### Archived Version File
```yaml
---
title: "My Essay" 
description: "Essay description"
startDate: "2023-01-15"
updated: "2023-01-15"  # Date when this version was current
type: "essay"
growthStage: "budding"  # Growth stage at time of this version
version: 1
isArchived: true
canonicalUrl: "/my-essay"
versionSummary: "Initial publication"  
---
```

## Implementation Strategy

### Phase 1: Core Infrastructure

1. **Extend Content Collections Schema**
   - Add optional `version`, `isArchived`, `canonicalUrl`, `versionSummary` fields
   - Update TypeScript types for versioned content

2. **Modify Routing Logic (`[...slug].astro`)**
   - Detect versioned files by `-v{number}` suffix pattern
   - Generate additional static routes for versioned content
   - Group related versions by base slug

3. **Create Version Detection Utilities**
   - Function to identify if content has multiple versions
   - Function to get all versions for a given post
   - Function to determine latest version

### Phase 2: UI Components

1. **Version Navigation Component**
   - Shows current version number and total versions
   - Navigation between versions (Previous/Next/Latest)
   - Expandable version history with summaries

2. **Archive Warning Component** 
   - Alert banner for older versions
   - Link to current version
   - Clear indication of content age

3. **Integration with Existing Layouts**
   - Add version components to `PostLayout.astro`
   - Position above the fold but non-intrusive

### Phase 3: Integration & Polish

1. **Link Processing Updates**
   - Ensure wiki-style `[[internal links]]` resolve to latest versions
   - Handle edge cases for version-specific linking

2. **SEO Optimization**
   - Canonical tags pointing to latest version
   - Proper meta descriptions and titles
   - Structured data for versioned content

3. **Search & Discovery**
   - Ensure search primarily surfaces latest versions
   - Filter archived versions from main collection views

## Author Workflow

### Creating First Version
1. Author writes and publishes `my-essay.mdx` normally
2. Content is available at `/my-essay` 
3. No versioning UI appears (single version)

### Creating Second Version
1. Author decides to make substantial changes
2. Duplicate current file: `cp my-essay.mdx my-essay-v1.mdx`
3. Update `my-essay-v1.mdx` frontmatter:
   - Add `version: 1`
   - Add `isArchived: true`  
   - Add `canonicalUrl: "/my-essay"`
   - Optionally add `versionSummary: "Initial publication"`
4. Update `my-essay.mdx` with new content:
   - Add `version: 2`
   - Update `updated` date
   - Adjust `growthStage` if needed
5. Deploy - versioning UI now appears on both versions

### Creating Subsequent Versions  
1. When ready for version 3, duplicate latest: `cp my-essay.mdx my-essay-v2.mdx`
2. Update `my-essay-v2.mdx` with version 2 metadata
3. Update `my-essay.mdx` to version 3
4. Deploy

## UI/UX Design

### Version Navigation Component
```
┌─────────────────────────────────────────────────┐
│ 📝 Version 2 of 3 • Updated March 2024          │
│ ← v1 | Latest | v3 →                           │  
│ [Show version history ↓]                        │
└─────────────────────────────────────────────────┘

[Expandable version history]
┌─────────────────────────────────────────────────┐
│ Version History:                                 │
│ • v3 (Current) - Major revision with new section │
│ • v2 (You are here) - Added examples            │  
│ • v1 - Initial publication                      │
└─────────────────────────────────────────────────┘
```

### Archive Warning (for older versions)
```  
┌─────────────────────────────────────────────────┐
│ ⚠️  You're viewing an older version (v1 of 3)    │
│ → View current version                          │
└─────────────────────────────────────────────────┘
```

## Technical Considerations

### Astro Static Generation
- Modify `getStaticPaths()` to detect versioned files and generate additional routes
- Parse filename patterns to extract version numbers and base slugs
- Handle route conflicts and ensure proper precedence

### Content Discovery Algorithm
1. Scan content directories for files matching `{slug}-v{number}.mdx` pattern
2. Group by base slug
3. Sort versions numerically  
4. Generate route map: `/v{number}/{slug}` → versioned file
5. Generate canonical route: `/{slug}` → latest version file

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

## Success Metrics

### Author Experience  
- Time to create new version < 5 minutes
- Zero friction for single-version content
- Clear mental model for version management

### Reader Experience
- Intuitive navigation between versions
- Clear understanding of content timeline
- No confusion about which version is current

### Technical Performance
- Build time increase < 20% with versioned content
- No measurable impact on page load speeds
- SEO rankings maintained or improved

## Implementation Checklist

### Core Infrastructure
- [x] Extend content schema with version fields
- [x] Update TypeScript types and interfaces
- [x] Implement version detection utilities
- [x] Modify routing logic for versioned URLs
- [x] Create static path generation for versions

### UI Components  
- [x] Version navigation component
- [x] Archive warning component
- [x] Integration with PostLayout
- [x] Responsive design for mobile

### Integration
- [x] Update wiki-link processing
- [x] Add canonical tag support
- [x] Update sitemap generation
- [x] Test with existing features (search, topics, etc.)

### Testing & Polish
- [ ] Test with sample versioned content
- [ ] Verify SEO compliance
- [ ] Performance testing
- [ ] Documentation for content workflow
- [ ] Create an interactive CLI script the user can run to make a new version of a post

This versioning system provides a lightweight, author-friendly way to show content evolution while maintaining excellent user experience and technical performance.
# Maggie Appleton's Digital Garden

A personal website and digital garden built with Astro, featuring growing notes, essays, and design patterns.

## Tech Stack

- **Astro** - Static site generator with MDX support, most components are Astro components
- **React** - Only used when necessary
- **JavaScript** - Primary language, minimal TypeScript usage
- **D3** - Data visualizations (used only when needed)
- **Tippy.js** - Tooltip hover previews 

## Development

```bash
npm run dev          # Start development server
npm run build        # Production build
./deploy.sh          # Deploy to Vercel
```

## Content Collections

- **Essays** - Opinionated, longform narrative writing with an agenda
- **Notes** - Loose, unopinionated notes on things
- **Patterns** - A catalogue of design patterns
- **Talks** - Conference presentations
- **Podcasts** - Interviews on various podcasts
- **Smidgeons** - A stream of interesting links, papers, and tiny thoughts
- **Now** - Current status updates
- **Library/Antilibrary** - Books I've read

## Key Features

- **Wiki-style links** - `[[internal links]]` with hover previews
- **Backlinks** - Automatic bidirectional linking  
- **Growth stages** - Content maturity indicators (seedling → budding → evergreen) applied to most content types
- **Topics** - Auto-generated from frontmatter
- **Content versioning** - Folder-based versioning with automatic canonical URLs
- **OG image generation** - Dynamic Open Graph images using Satori and Sharp
- **Webmentions** - Social interactions via webmention.io API with brid.gy to fetch from multiple sites
- **Masonry grids** - CSS-only responsive layouts
- **Draft system** - Content can be marked as drafts to hide from production
- **View transitions** - Uses Astro's view transitions. This can cause issues with JavaScript scripts loading after page loads.

## Scripts

- `generate-links.js` - Processes wiki-style internal links
- `generate-topics.ts` - Creates topic index from content frontmatter  
- `get-webmentions.js` - Fetches webmentions for posts

## Custom Components

- **`src/components/mdx/`** - Reusable components imported into MDX files (Alert, Tooltip, Typography, etc.)
- **`src/components/unique/`** - One-off components built for specific blog posts
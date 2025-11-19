---
on:
  workflow_dispatch:
permissions:
  contents: read
  actions: read
  issues: read
  pull-requests: read
timeout-minutes: 30
network: {}
safe-outputs:
  create-issue:
    title-prefix: "[a11y] "
    labels: [accessibility, automated-audit]
    max: 20
engine: claude
tools:
  playwright:
steps:
  - name: Install dependencies
    run: npm install
  - name: Build Astro site
    run: npm run build
  - name: Start local server in background
    run: npx serve -s dist -l tcp://localhost:3000 &
  - name: Wait for server to be ready
    run: sleep 5
---

# Accessibility Audit Workflow

You are an accessibility testing specialist. Your task is to perform a comprehensive accessibility audit of the Maggie Appleton digital garden website.

## Context

The Astro site has been built and is now running locally at `http://localhost:3000`. You have access to Playwright for browser automation and can take screenshots.

## Your Task

1. **Crawl the entire site** starting from `http://localhost:3000`:
   - Navigate through all main pages (home, essays, notes, patterns, library, etc.)
   - Follow internal links to discover all content pages
   - Build a comprehensive list of unique URLs to test

2. **For each page, check for accessibility violations**:
   - Missing alt text on images
   - Poor color contrast ratios (WCAG AA/AAA standards)
   - Missing ARIA labels and landmarks
   - Improper heading hierarchy (h1 → h2 → h3, no skipping levels)
   - Form inputs without associated labels
   - Links without descriptive text (avoid "click here")
   - Missing focus indicators for keyboard navigation
   - Improper use of semantic HTML
   - Any other WCAG 2.1 Level A/AA violations

3. **Use Playwright's accessibility testing capabilities**:
   - Use `page.accessibility.snapshot()` to capture accessibility tree
   - Use `page.evaluate()` with axe-core if needed for detailed WCAG checks
   - Take screenshots of problematic areas to provide visual context

4. **Create individual GitHub issues for each unique problem**:
   - Each issue should focus on ONE specific accessibility problem
   - Include:
     - Clear title describing the issue
     - Affected page URL(s)
     - WCAG criterion violated (e.g., "1.1.1 Non-text Content", "1.4.3 Contrast")
     - Severity level (Critical/High/Medium/Low)
     - Specific location (CSS selector or description)
     - Current state vs. expected state
     - Screenshot showing the problem (if visual)
     - Suggested fix/remediation steps
   - Format issues using markdown with proper headings and code blocks

5. **Important**:
   - Only test pages on `localhost:3000` - do NOT make external network requests
   - Group similar violations on the same page into one issue (e.g., "Multiple images missing alt text on /essays/example")
   - Don't create duplicate issues for the same problem across multiple pages - instead list all affected pages in one issue
   - Prioritize issues by severity (Critical first)
   - Limit to the top 20 most important issues if you find many violations

## Output Format

For each issue you create, use this structure:

```markdown
## Summary
[Brief description of the accessibility problem]

## WCAG Criterion
- **Standard**: WCAG 2.1 Level [A/AA/AAA]
- **Criterion**: [Number and name, e.g., "1.4.3 Contrast (Minimum)"]

## Severity
[Critical/High/Medium/Low]

## Affected Pages
- http://localhost:3000/[page-url]
- http://localhost:3000/[another-page-url]

## Problem Description
[Detailed explanation of what's wrong]

## Current State
[What the element/page currently does]

## Expected State
[What it should do to be accessible]

## Location
[CSS selector or description of where to find this element]

## Screenshot
[If applicable, reference screenshot taken]

## Suggested Fix
[Specific code changes or recommendations]
```

Begin the audit now. Start by crawling the site to discover all pages, then systematically test each page for accessibility violations.

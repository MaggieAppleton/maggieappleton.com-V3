# August update Instagram frames

## Goal

Replace the blocked Instagram embed in the August 2026 update with two local
still frames that lead readers to the original reel.

## Design

- Add a small `InstagramFrameLink` MDX component that takes an image source and
  a post URL.
- Each frame is an accessible external link to
  `https://www.instagram.com/reel/DUyorsnkhJQ/`, opening in a new tab.
- The component places a white circular play icon at its centre on hover and
  keyboard focus. The image remains unobscured at rest.
- A wrapper in the August update lays out the two portrait frames in two equal
  columns on wider screens and one column on small screens.
- Store the cropped, web-optimised local screenshots alongside the site’s image
  assets; no Instagram script or iframe remains.

## Failure handling and verification

- The links retain a visible focus state and descriptive aria labels.
- Build the Astro site and inspect the update at desktop and mobile widths.
- Confirm both images link to the canonical reel URL and the original embed is
  absent.

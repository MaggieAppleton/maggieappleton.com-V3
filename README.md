# Maggieappleton.com, Version 3

This is the source code for maggieappleton.com, a digital garden filled with growing notes, essays,
and design patterns.

It's open source to let people poke around and get ideas for their own garden. However, I'd rather
you didn't fork it wholesale in order to build your own garden. First because my code is
questionable at best, and second because I designed it according to my own aesthetic preferences,
and functional needs / desires. Yours won't be the same.

It's also awkward when I stumble on someone else's website that is an exact expression of my own
design taste and identity. Like walking in on someone wearing your clothing. That said, you can do
what you like on the web and I'm not going to make a huge fuss about it.

I strongly encourage you to build your own garden!

## Tech Stack

Built with Astro

MDX  
Backlinks  
Tooltip hover previews with Tippy.js  
Masonry grids with just CSS  
Webmentions with Brid.gy and Webmention.io  
Typed collections – essays, notes, patterns, talks, podcasts, smidgeons, library, antilibrary, and
now updates

## Notes to Myself

To run locally: `npm run dev`  
To deploy: `./deploy.sh`

- Runs `git push`
- Runs `npm run build`
- Runs `vercel --prod`

Building locally for speed and Astro's image caching.

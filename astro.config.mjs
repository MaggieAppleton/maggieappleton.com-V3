// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import icon from "astro-icon";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link";
import { remarkLongBlockquote } from "./src/plugins/remark-long-blockquote";

// https://astro.build/config
export default defineConfig({
  site: "https://maggieappleton.com",
  image: {
    domains: ["res.cloudinary.com"],
  },
  integrations: [
    mdx({
      remarkPlugins: [remarkWikiLink, remarkLongBlockquote],
      shikiConfig: {
        theme: "night-owl",
        wrap: true,
      },
    }),
react(),
    icon(),
  ],
  vite: {
    optimizeDeps: {
      include: ["three"],
    },
  },
});

// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import icon from "astro-icon";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link";
import { remarkLongBlockquote } from "./src/plugins/remark-long-blockquote";
import { localWritingEditor } from "./src/editor/integration.mjs";
import { remarkSourceMarkers } from "./src/editor/rendering/remark-source-markers.mjs";

// https://astro.build/config
export default defineConfig({
  site: "https://maggieappleton.com",
  trailingSlash: "never",
  image: {
    domains: ["res.cloudinary.com"],
  },
  integrations: [
    localWritingEditor(),
    mdx({
      remarkPlugins: [remarkSourceMarkers, remarkWikiLink, remarkLongBlockquote],
      shikiConfig: {
        theme: "night-owl",
        wrap: true,
      },
    }),
react(),
    icon(),
  ],
  vite: {
    server: {
      cors: false,
      watch: { ignored: ["**/.local-writing-editor/**"] },
    },
    optimizeDeps: {
      // The editor suppresses Vite reloads while a document is open. Prebundle
      // its client stack and the site-wide dev island before the first page load.
      include: [
        "three", "agentation", "@astrojs/react/client.js",
        "react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client",
        "@mdxeditor/editor", "@lexical/react/LexicalComposerContext.js", "@lexical/list", "lexical",
        "js-yaml", "yaml", "unified", "diff", "micromark-util-decode-string",
        "remark-parse", "remark-mdx", "remark-frontmatter", "remark-gfm",
        "mdast-util-to-markdown", "mdast-util-mdx", "mdast-util-gfm",
      ],
    },
  },
});

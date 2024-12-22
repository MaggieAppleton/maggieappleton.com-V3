// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import icon from "astro-icon";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link";

// https://astro.build/config
export default defineConfig({
	site: "https://www.maggieappleton.com",
	image: {
		domains: ["res.cloudinary.com"],
	},
	integrations: [
		mdx({
			remarkPlugins: [remarkWikiLink],
		}),
		react(),
		icon(),
	],
});

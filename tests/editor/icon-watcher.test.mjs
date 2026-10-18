import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import icon from "astro-icon";

test("transcript saves leave server modules intact while SVG edits refresh icons", async () => {
	const directory = await mkdtemp(join(tmpdir(), "editor-icon-watcher-"));
	try {
		const iconDirectory = join(directory, "icons");
		await mkdir(iconDirectory);
		const svg = join(iconDirectory, "example.svg");
		await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');
		let configuration;
		icon({ iconDir: iconDirectory }).hooks["astro:config:setup"]({
			config: { root: pathToFileURL(`${directory}/`), output: "static" },
			logger: { info() {}, warn() {} },
			updateConfig(value) { configuration = value; },
		});
		const listeners = [];
		let invalidations = 0;
		configuration.vite.plugins[0].configureServer({
			watcher: { add() {}, on(event, handler) { listeners.push({ event, handler }); } },
			moduleGraph: { invalidateAll() { invalidations++; } },
		});
		async function change(path) {
			for (const { event, handler } of listeners) {
				if (event === "all") await handler("change", path);
				else if (event === "change") await handler(path);
			}
		}
		await change(join(directory, "src/content/talks/fortune-telling.mdx"));
		await change(join(directory, ".local-writing-editor/backups/transcript.mdx"));
		assert.equal(invalidations, 0, "writing must not invalidate the entire Astro server");
		await change(svg);
		assert.equal(invalidations, 1, "local icon editing must still work");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

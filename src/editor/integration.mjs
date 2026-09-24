import { randomBytes } from "node:crypto";

export function localWritingEditor() {
	return {
		name: "local-writing-editor",
		hooks: {
			"astro:config:setup"({ command, injectRoute }) {
				if (command !== "dev") return;
				injectRoute({
					pattern: "/_editor",
					entrypoint: new URL("./routes/editor.astro", import.meta.url),
					prerender: false,
				});
				injectRoute({
					pattern: "/_editor/api/document",
					entrypoint: new URL("./routes/document.js", import.meta.url),
					prerender: false,
				});
				injectRoute({
					pattern: "/_editor/api/drafts",
					entrypoint: new URL("./routes/drafts.js", import.meta.url),
					prerender: false,
				});
				injectRoute({
					pattern: "/_editor/api/covers",
					entrypoint: new URL("./routes/covers.js", import.meta.url),
					prerender: false,
				});
				injectRoute({
					pattern: "/_editor/api/ready",
					entrypoint: new URL("./routes/ready.js", import.meta.url),
					prerender: false,
				});
			},
			"astro:server:start"({ address }) {
				delete process.env.LOCAL_WRITING_EDITOR_ORIGIN;
				delete process.env.LOCAL_WRITING_EDITOR_TOKEN;
				const host = address.address === "::1" ? "[::1]" :
					address.address === "127.0.0.1" ? "127.0.0.1" : null;
				if (!host) return;
				process.env.LOCAL_WRITING_EDITOR_ORIGIN = `http://${host}:${address.port}`;
				process.env.LOCAL_WRITING_EDITOR_TOKEN = randomBytes(32).toString("base64url");
			},
			"astro:server:done"() {
				delete process.env.LOCAL_WRITING_EDITOR_ORIGIN;
				delete process.env.LOCAL_WRITING_EDITOR_TOKEN;
			},
		},
	};
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createFixtureProject, startFixtureServer } from "../fixture-project.mjs";

test("a chart drawn while the original DOM is staged redraws after reattachment", async ({ page }) => {
	test.setTimeout(180_000);
	const fixture = await createFixtureProject({ name: "editor-chart-reattach" });
	let server;
	try {
		const mountPath = "src/editor/client/mount.mjs";
		const mount = await readFile(fixture.resolve(mountPath), "utf8");
		const functionAnchor = "export function mountWritingEditor() {";
		const stagingAnchor = "document.body.append(staging);\n\tcreateRoot(original).render";
		assert.ok(mount.includes(functionAnchor) && mount.includes(stagingAnchor));
		await fixture.write(mountPath, mount.replace(functionAnchor, "export async function mountWritingEditor() {")
			.replace(stagingAnchor, `document.body.append(staging);
	if (new URLSearchParams(location.search).has("chartStagingTest")) {
		await new Promise((resolve, reject) => {
			const deadline = Date.now() + 5_000;
			const check = () => {
				const svg = staging.querySelector("#garmin-chart svg");
				if (svg?.getAttribute("width") === "0" && svg.getAttribute("height") === "0") {
					window.__chartStagingZeroObserved = true;
					resolve();
				} else if (Date.now() >= deadline) reject(new Error("Chart did not draw while staged"));
				else setTimeout(check, 10);
			};
			check();
		});
	}
	createRoot(original).render`));
		const chartPath = "src/components/unique/GarminData.astro";
		const chart = await readFile(fixture.resolve(chartPath), "utf8");
		const chartAnchor = "// Create chart on load\n\t\tcreateChart();";
		assert.ok(chart.includes(chartAnchor));
		await fixture.write(chartPath, chart.replace(chartAnchor, `// Create chart on load
		if (new URLSearchParams(location.search).has("chartStagingTest")) {
			await new Promise<void>((resolve) => {
				const check = () => document.getElementById("local-editor-staging")?.contains(container)
					? resolve() : setTimeout(check, 10);
				check();
			});
		}
		createChart();`));
		server = await startFixtureServer(fixture.root, { timeout: 120_000 });
		await page.goto(`${server.origin}/_editor?documentId=essays%3Agrowing-a-human&chartStagingTest=1`,
			{ waitUntil: "domcontentloaded" });
		await expect.poll(() => page.evaluate(() => window.__chartStagingZeroObserved)).toBe(true);
		const body = page.getByRole("textbox", { name: "Article body" });
		await expect(body).toBeVisible();
		const svg = body.locator("#garmin-chart svg").first();
		await expect(svg).toBeVisible();
		const size = await svg.evaluate((element) => ({ width: Number(element.getAttribute("width")),
			height: Number(element.getAttribute("height")) }));
		assert.ok(size.width > 0 && size.height > 0, `Chart size stayed ${size.width}×${size.height}`);
	} finally {
		if (server) await server.stop();
		await fixture.cleanup();
	}
});

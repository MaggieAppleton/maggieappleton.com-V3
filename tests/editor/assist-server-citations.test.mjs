import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";

import { createCitationService, fetchCitationPage, publicCitationUrl } from "../../src/editor/assist/server/citations.mjs";
import { ALL, citationGenerationRequest, discoveryUrls } from "../../src/editor/assist/routes/citations.js";

const sentence = "In 2020, the town had 4,000 residents, and its river flooded twice.";

test("citation JSON responses include the required JSON instruction in the input", () => {
	for (const input of [
		{ kind: "extract", sentence },
		{ kind: "assess", claim: "the town had 4,000 residents", sourceType: "census", pageText: "Town census data." },
	]) {
		const request = citationGenerationRequest(input, "test-model");
		assert.equal(request.text.format.type, "json_object");
		assert.match(request.input, /\bjson\b/i);
	}
});

test("extract accepts distinct exact claims and rejects invented or ambiguous quotes", async () => {
	let searched = false;
	const service = createCitationService({
		generate: async () => ({ claims: [
			{ text: "the town had 4,000 residents", sourceType: "census" },
			{ text: "its river flooded twice", sourceType: "local records" },
			{ text: "the town had 5,000 residents", sourceType: "census" },
			{ text: "the town had 4,000 residents", sourceType: "census" },
		] }),
		search: async () => { searched = true; return []; },
		fetchPage: async () => { throw new Error("Unexpected fetch"); },
	});
	assert.deepEqual(await service.extract({ sentence }), { sentence, claims: [
		{ text: "the town had 4,000 residents", start: 9, end: 37, sourceType: "census" },
		{ text: "its river flooded twice", start: 43, end: 66, sourceType: "local records" },
	] });
	assert.equal(searched, false);
	const repeated = createCitationService({ generate: async () => ({ claims: [
		{ text: "many", sourceType: "study" },
	] }), search: async () => [], fetchPage: async () => "" });
	assert.deepEqual((await repeated.extract({ sentence: "many say many things." })).claims, []);
});

test("extract retains more than five distinct claims", async () => {
	const parts = ["A rose", "B lily", "C oak", "D pine", "E fern", "F moss"];
	const longSentence = `${parts.join(", ")}.`;
	const service = createCitationService({
		generate: async () => ({ claims: parts.map((text) => ({ text, sourceType: "field record" })) }),
		search: async () => [], fetchPage: async () => "",
	});
	const result = await service.extract({ sentence: longSentence });
	assert.deepEqual(result.claims.map((claim) => claim.text), parts);
});

test("search discovers URLs and only admits exact passages from fetched pages", async () => {
	const calls = [];
	const service = createCitationService({
		generate: async ({ kind, pageText, claim }) => {
			assert.equal(kind, "assess");
			assert.equal(claim, "the town had 4,000 residents");
			if (pageText.includes("Census data")) return { match: "supported", passage: "The town had 4,000 residents in 2020." };
			if (pageText.includes("Estimate")) return { match: "uncertain", passage: "Estimate: roughly 4,000 people lived there." };
			return { match: "unsupported", passage: "No relevant evidence." };
		},
		search: async (input) => { calls.push(input); return [
			"https://census.example/data", "https://local.example/report",
			"https://irrelevant.example/page", "http://localhost/private",
		]; },
		fetchPage: async (url) => {
			calls.push(url);
			if (url.includes("census")) return { html: '<html><title>Town census</title><meta property="og:site_name" content="Census Office"><body>Census data. The town had 4,000 residents in 2020.</body></html>' };
			if (url.includes("local")) return { html: "<title>Local report</title><p>Estimate: roughly 4,000 people lived there.</p>" };
			return { html: "<title>Other</title><p>No relevant evidence.</p>" };
		},
	});
	assert.deepEqual(await service.findSources({ claim: "the town had 4,000 residents", sourceType: "census" }), { sources: [
		{ title: "Town census", publisher: "Census Office", url: "https://census.example/data", passage: "The town had 4,000 residents in 2020.", match: "supported" },
		{ title: "Local report", publisher: "local.example", url: "https://local.example/report", passage: "Estimate: roughly 4,000 people lived there.", match: "uncertain" },
	] });
	assert.equal(calls[0].claim, "the town had 4,000 residents");
	assert.ok(!calls.includes("http://localhost/private"));
});

test("search rejects model-only evidence, unsafe URLs, and inaccessible pages", async () => {
	const fetched = [];
	const service = createCitationService({
		generate: async () => ({ match: "supported", passage: "An invented supporting sentence." }),
		search: async () => ["http://127.0.0.1/secret", "file:///etc/passwd", "https://safe.example/one", "https://safe.example/two"],
		fetchPage: async (url) => {
			fetched.push(url);
			if (url.endsWith("two")) throw new Error("Could not fetch");
			return { html: "<title>Actual page</title><p>Unrelated text.</p>" };
		},
	});
	assert.deepEqual(await service.findSources({ claim: "a claim", sourceType: "study" }), { sources: [] });
	assert.deepEqual(fetched, ["https://safe.example/one", "https://safe.example/two"]);
});

test("discovery requires a real Responses web search call", () => {
	const message = { type: "message", content: [{ annotations: [{ url: "https://journal.example/study" }] }] };
	assert.deepEqual(discoveryUrls({ output_text: '{"urls":["https://invented.example/"]}', output: [message] }), []);
	assert.deepEqual(discoveryUrls({ output_text: '{"urls":["https://journal.example/study"]}', output: [
		{ type: "web_search_call", status: "completed", action: { type: "search", sources: [{ url: "https://archive.example/source" }] } }, message,
	] }), ["https://archive.example/source"]);
});

test("public source URL validation excludes local and non-web targets", () => {
	for (const url of ["http://127.0.0.1/x", "http://10.0.0.5/x", "http://192.168.0.2/x",
		"http://192.0.2.1/x", "https://example.com:8080/x", "http://localhost/x",
		"https://user:password@example.com/x", "file:///etc/passwd"]) {
		assert.equal(publicCitationUrl(url), null, url);
	}
	assert.equal(publicCitationUrl("https://example.com/path")?.href, "https://example.com/path");
	assert.equal(publicCitationUrl("https://[2606:4700:4700::1111]/path")?.href,
		"https://[2606:4700:4700::1111]/path");
});

test("malformed redirect location rejects the page fetch without an uncaught callback error", async () => {
	const get = (_url, _options, onResponse) => {
		const request = new EventEmitter();
		setImmediate(() => onResponse({ statusCode: 302, headers: { location: "http://[" }, resume() {} }));
		return request;
	};
	await assert.rejects(fetchCitationPage("https://example.com/source", {
		resolveHost: async () => [{ address: "1.1.1.1", family: 4 }], get,
	}), /redirect/i);
});

test("citation route applies local auth and rejects unknown actions before contacting OpenAI", async () => {
	const previousOrigin = process.env.LOCAL_WRITING_EDITOR_ORIGIN;
	const previousToken = process.env.LOCAL_WRITING_EDITOR_TOKEN;
	process.env.LOCAL_WRITING_EDITOR_ORIGIN = "http://127.0.0.1:4321";
	process.env.LOCAL_WRITING_EDITOR_TOKEN = "secret";
	try {
		function request(token, body) {
			return new Request("http://127.0.0.1:4321/_editor/api/assist/citations", {
				method: "POST", headers: { Origin: "http://127.0.0.1:4321", "Content-Type": "application/json",
					"X-Local-Editor-Token": token }, body: JSON.stringify(body),
			});
		}
		const denied = await ALL({ request: request("wrong", { action: "extract", sentence }) });
		assert.equal(denied.status, 403);
		const invalid = await ALL({ request: request("secret", { action: "unknown" }) });
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error.code, "invalid_citation_request");
	} finally {
		if (previousOrigin == null) delete process.env.LOCAL_WRITING_EDITOR_ORIGIN;
		else process.env.LOCAL_WRITING_EDITOR_ORIGIN = previousOrigin;
		if (previousToken == null) delete process.env.LOCAL_WRITING_EDITOR_TOKEN;
		else process.env.LOCAL_WRITING_EDITOR_TOKEN = previousToken;
	}
});

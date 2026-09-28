import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

import { EditorServiceError } from "../../server/errors.mjs";

const MAX_SENTENCE = 2000;
const MAX_CLAIM = 500;
const MAX_PAGE_BYTES = 256_000;
const MAX_PAGE_TEXT = 40_000;
const MAX_CANDIDATES = 5;

function invalid(message) {
	return new EditorServiceError(400, "invalid_citation_request", message);
}

function object(value) {
	if (typeof value === "string") {
		try { return JSON.parse(value); } catch { return null; }
	}
	return value && typeof value === "object" ? value : null;
}

function meaningful(value, maximum) {
	return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function publicIp(address) {
	const family = isIP(address);
	if (family === 4) {
		const [a, b, c] = address.split(".").map(Number);
		return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && c <= 2))) ||
			(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
			(a === 203 && b === 0 && c === 113));
	}
	if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
	return false;
}

export function publicCitationUrl(value) {
	try {
		const url = new URL(value);
		const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
			(url.port && !["80", "443"].includes(url.port)) ||
			(!hostname.includes(".") && !isIP(hostname)) ||
			/(?:^|\.)(?:localhost|local|internal)$/i.test(hostname)) return null;
		if (isIP(hostname) && !publicIp(hostname)) return null;
		return url;
	} catch { return null; }
}

function decodeEntities(value) {
	const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
	return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (full, entity) => {
		if (entity[0] !== "#") return named[entity.toLowerCase()] ?? full;
		const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
		return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full;
	});
}

function pageContent(html) {
	if (typeof html !== "string") return { title: "", publisher: "", text: "" };
	html = html.slice(0, MAX_PAGE_BYTES);
	const title = decodeEntities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
		.replace(/\s+/g, " ").trim().slice(0, 180);
	const siteNameTag = [...html.matchAll(/<meta\b[^>]*>/gi)].find(([tag]) =>
		/\b(?:property|name)\s*=\s*(["'])og:site_name\1/i.test(tag));
	const publisher = decodeEntities(siteNameTag?.[0].match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "")
		.replace(/\s+/g, " ").trim().slice(0, 100);
	const text = decodeEntities(html
		.replace(/<(?:script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|svg|template)\s*>/gi, " ")
		.replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ").trim().slice(0, MAX_PAGE_TEXT);
	return { title, publisher, text };
}

/** Fetch HTML with a pinned, public DNS answer and a strict byte cap. */
export async function fetchCitationPage(input, { signal, redirects = 2, resolveHost = lookup,
	get = (url, options, onResponse) => (url.protocol === "https:" ? https : http).get(url, options, onResponse) } = {}) {
	const url = publicCitationUrl(input);
	if (!url) throw invalid("A public source URL is required");
	const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
	const addresses = await resolveHost(hostname, { all: true });
	const selected = addresses.find((entry) => publicIp(entry.address));
	if (!selected || addresses.some((entry) => !publicIp(entry.address))) throw invalid("Source URL resolves outside the public internet");
	return new Promise((resolve, reject) => {
		const request = get(url, {
			signal, timeout: 7000, headers: { Accept: "text/html" },
			lookup: (_host, _options, callback) => callback(null, selected.address, selected.family),
		}, (response) => {
			if ([301, 302, 303, 307, 308].includes(response.statusCode) && redirects > 0 && response.headers.location) {
				response.resume();
				let next;
				try { next = new URL(response.headers.location, url).href; }
				catch { reject(new Error("Source redirect URL is invalid")); return; }
				fetchCitationPage(next, { signal, redirects: redirects - 1, resolveHost, get }).then(resolve, reject);
				return;
			}
			if (response.statusCode !== 200 || !/^text\/html\b/i.test(response.headers["content-type"] ?? "")) {
				response.resume(); reject(new Error("Source is not a public HTML page")); return;
			}
			const chunks = [];
			let bytes = 0;
			response.on("data", (chunk) => {
				bytes += chunk.length;
				if (bytes > MAX_PAGE_BYTES) { response.destroy(new Error("Source page is too large")); return; }
				chunks.push(chunk);
			});
			response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), url: url.href }));
			response.on("error", reject);
		});
		request.on("timeout", () => request.destroy(new Error("Source request timed out")));
		request.on("error", reject);
	});
}

export function createCitationService({ generate, search, fetchPage = fetchCitationPage }) {
	if (typeof generate !== "function" || typeof search !== "function" || typeof fetchPage !== "function") {
		throw new TypeError("Citation service needs generate, search, and fetchPage functions");
	}
	return {
		async extract({ sentence }, { signal } = {}) {
			if (!meaningful(sentence, MAX_SENTENCE)) throw invalid("A sentence is required");
			const result = object(await generate({ kind: "extract", sentence, signal }));
			const seen = new Set();
			const claims = [];
			for (const candidate of Array.isArray(result?.claims) ? result.claims.slice(0, sentence.length) : []) {
				const { text, sourceType } = candidate ?? {};
				if (!meaningful(text, MAX_CLAIM) || !meaningful(sourceType, 100) || seen.has(text)) continue;
				const start = sentence.indexOf(text);
				if (start < 0 || sentence.indexOf(text, start + 1) >= 0) continue;
				if (candidate.start != null && candidate.start !== start) continue;
				if (candidate.end != null && candidate.end !== start + text.length) continue;
				claims.push({ text, start, end: start + text.length, sourceType: sourceType.trim() });
				seen.add(text);
			}
			return { sentence, claims };
		},
		async findSources({ claim, sourceType }, { signal } = {}) {
			if (!meaningful(claim, MAX_CLAIM) || !meaningful(sourceType, 100)) throw invalid("A claim and source type are required");
			const discovered = await search({ claim, sourceType, signal });
			const candidates = Array.isArray(discovered) ? discovered : object(discovered)?.urls;
			const unique = new Set();
			const sources = [];
			for (const candidate of Array.isArray(candidates) ? candidates.slice(0, 12) : []) {
				const url = publicCitationUrl(typeof candidate === "string" ? candidate : candidate?.url);
				if (!url || unique.has(url.href)) continue;
				unique.add(url.href);
				if (unique.size > MAX_CANDIDATES) break;
				try {
					const fetched = await fetchPage(url.href, { signal });
					const finalUrl = publicCitationUrl(fetched?.url ?? url.href);
					if (!finalUrl) continue;
					const { title, publisher, text } = pageContent(fetched?.html);
					if (!text) continue;
					const assessment = object(await generate({ kind: "assess", claim, sourceType, pageText: text, signal }));
					const match = assessment?.match;
					const passage = assessment?.passage;
					if (!["supported", "uncertain"].includes(match) || !meaningful(passage, 1000) || !text.includes(passage)) continue;
					sources.push({ title: title || finalUrl.hostname, publisher: publisher || finalUrl.hostname,
						url: finalUrl.href, passage, match });
					if (sources.length === 2) break;
				} catch (error) {
					if (signal?.aborted) throw error;
					// A failed candidate should not hide other reachable sources.
				}
			}
			return { sources };
		},
	};
}

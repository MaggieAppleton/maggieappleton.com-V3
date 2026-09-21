const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const NON_PAGE_EXTENSION = /\.[a-z0-9]+$/i;
const FEED_PATHS = new Set(["/feed", "/rss"]);

const normalizePathname = (pathname) => {
	const withoutDuplicateSlashes = pathname.replace(/\/{2,}/g, "/");
	if (withoutDuplicateSlashes === "/") return "/";
	return withoutDuplicateSlashes.replace(/\/+$/, "");
};

export function classifyLink(href, { currentUrl, siteUrl }) {
	if (typeof href !== "string" || href.length === 0 || href.startsWith("#")) {
		return { kind: "excluded" };
	}

	let url;
	try {
		url = new URL(href, currentUrl);
	} catch {
		return { kind: "excluded" };
	}

	if (!HTTP_PROTOCOLS.has(url.protocol)) return { kind: "excluded" };

	const internalOrigins = new Set(
		[currentUrl?.origin, siteUrl?.origin].filter(Boolean),
	);
	if (!internalOrigins.has(url.origin)) return { kind: "external" };

	const pathname = normalizePathname(url.pathname);
	const currentPathname = normalizePathname(currentUrl.pathname);
	if (
		(url.hash && pathname === currentPathname) ||
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		FEED_PATHS.has(pathname) ||
		NON_PAGE_EXTENSION.test(pathname)
	) {
		return { kind: "excluded" };
	}

	return { kind: "internal-page", pathname };
}

export function deriveTitleFromPathname(pathname) {
	const finalSegment = pathname.split("/").filter(Boolean).at(-1);
	if (!finalSegment) return "";

	let decodedSegment;
	try {
		decodedSegment = decodeURIComponent(finalSegment);
	} catch {
		decodedSegment = finalSegment;
	}

	return decodedSegment
		.replace(/[-_]+/g, " ")
		.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-GB"))
		.trim();
}

export function resolveInternalLinkPreview(
	href,
	{ currentUrl, siteUrl, previews },
) {
	const classification = classifyLink(href, { currentUrl, siteUrl });
	if (classification.kind !== "internal-page") return null;

	const indexedPreview = previews[classification.pathname];
	const title = indexedPreview?.title || deriveTitleFromPathname(classification.pathname);
	if (!title) return null;

	return {
		pathname: classification.pathname,
		title,
		description: indexedPreview?.description || "",
	};
}

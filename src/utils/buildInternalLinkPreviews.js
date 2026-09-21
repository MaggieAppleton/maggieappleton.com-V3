const validateRecord = (pathname, preview) => {
	if (
		pathname !== "/" &&
		(!pathname.startsWith("/") ||
			pathname.endsWith("/") ||
			pathname.includes("//") ||
			pathname.includes("?") ||
			pathname.includes("#"))
	) {
		throw new Error(`Internal preview pathname must be canonical: ${pathname}`);
	}
	if (!preview || typeof preview.title !== "string" || !preview.title.trim()) {
		throw new Error(`Internal preview title is required for ${pathname}`);
	}
	if (
		preview.description !== undefined &&
		typeof preview.description !== "string"
	) {
		throw new Error(`Internal preview description must be a string for ${pathname}`);
	}
};

export function buildInternalLinkPreviews(posts, staticPages) {
	const previews = {};

	for (const [pathname, preview] of Object.entries(staticPages)) {
		validateRecord(pathname, preview);
		previews[pathname] = {
			title: preview.title.trim(),
			description: preview.description?.trim() || "",
		};
	}

	for (const post of posts) {
		if (
			typeof post.slug !== "string" ||
			!post.slug ||
			post.slug.startsWith("/") ||
			post.slug.endsWith("/") ||
			post.slug.includes("//") ||
			post.slug.includes("://") ||
			post.slug.includes("?") ||
			post.slug.includes("#")
		) {
			throw new Error(`Internal preview slug must be canonical: ${post.slug}`);
		}
		const pathname = `/${post.slug}`;
		const preview = {
			title: post.ids?.[0],
			description: post.description || "",
		};
		validateRecord(pathname, preview);
		previews[pathname] = {
			title: preview.title.trim(),
			description: preview.description.trim(),
		};
	}

	return Object.fromEntries(
		Object.entries(previews).sort(([left], [right]) => left.localeCompare(right)),
	);
}

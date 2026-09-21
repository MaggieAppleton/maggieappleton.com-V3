const validateRecord = (pathname, preview) => {
	if (!pathname.startsWith("/")) {
		throw new Error(`Internal preview pathname must start with "/": ${pathname}`);
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

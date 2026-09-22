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
	if (
		preview.aliases !== undefined &&
		(!Array.isArray(preview.aliases) ||
			preview.aliases.some(
				(alias) => typeof alias !== "string" || !alias.trim(),
			))
	) {
		throw new Error(`Internal preview aliases must be strings for ${pathname}`);
	}
};

const buildPreviewRecord = (preview) => {
	const record = {
		title: preview.title.trim(),
		description: preview.description?.trim() || "",
	};
	const aliases = preview.aliases?.map((alias) => alias.trim());
	if (aliases?.length) record.aliases = aliases;
	return record;
};

export function buildInternalLinkPreviews(posts, staticPages) {
	const previews = {};

	for (const [pathname, preview] of Object.entries(staticPages)) {
		validateRecord(pathname, preview);
		previews[pathname] = buildPreviewRecord(preview);
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
			aliases: post.ids?.slice(1) || [],
		};
		validateRecord(pathname, preview);
		previews[pathname] = buildPreviewRecord(preview);
	}

	return Object.fromEntries(
		Object.entries(previews).sort(([left], [right]) => left.localeCompare(right)),
	);
}

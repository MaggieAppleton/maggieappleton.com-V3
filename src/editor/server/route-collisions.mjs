import { getPublicationBaseSlug, isVersionedPublicationEntry } from "../../utils/publication.mjs";

const ALWAYS_RESERVED = ["_editor", "drafts", "topics", "og"];

function pathSlug(value) {
	if (typeof value !== "string") return "";
	return value.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
}

function entryRoutes(entry) {
	if (typeof entry?.id !== "string") return [];
	const id = entry.id.replace(/\.mdx?$/i, "");
	const routes = [id];
	if (entry.slug) routes.push(pathSlug(entry.slug));
	if (isVersionedPublicationEntry(entry)) {
		const base = getPublicationBaseSlug(entry);
		const version = entry.data?.version ?? (Number(id.match(/-v(\d+)$/)?.[1]) || 1);
		routes.push(base, `v${version}/${base}`);
	}
	return routes;
}

/** A flat draft owns /slug, so it must not claim an existing route namespace. */
export function findDraftRouteCollision(slug, { entries = [], reservedRoutes = [], createdRoutes = [] } = {}) {
	if (slug.startsWith("now-")) return { kind: "reserved", route: "now-*" };
	const paths = [
		...ALWAYS_RESERVED,
		...reservedRoutes.map(pathSlug),
		...createdRoutes.map(pathSlug),
		...entries.flatMap(entryRoutes),
	];
	const collision = paths.find((route) => route === slug || route.startsWith(`${slug}/`));
	return collision ? { kind: "route", route: collision } : null;
}

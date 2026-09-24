import * as defaultFs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { createContentDate, createEssaySchema, createNoteSchema } from "../../content/publication-schemas.mjs";
import { createSourceDocument } from "../source/document.mjs";
import { listApprovedCovers } from "./covers.mjs";
import { EditorServiceError } from "./errors.mjs";
import { findDraftRouteCollision } from "./route-collisions.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PAD = (part) => String(part).padStart(2, "0");
const hash = (source) => createHash("sha256").update(source, "utf8").digest("hex");
const contentDate = createContentDate(z);
const schemas = {
	notes: createNoteSchema({ z, contentDate }),
	essays: createEssaySchema({ z, contentDate, image: () => z.string().min(1) }),
};

function serviceError(status, code, message, details) {
	return new EditorServiceError(status, code, message, details);
}

function calendarDay(date) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError("Draft clock must return a Date");
	return `${date.getFullYear()}-${DATE_PAD(date.getMonth() + 1)}-${DATE_PAD(date.getDate())}`;
}

export function suggestDraftSlug(title, collection, date = new Date()) {
	if (!Object.hasOwn(schemas, collection)) throw new TypeError("Unknown draft collection");
	const ascii = String(title ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
		.slice(0, 100).replace(/-+$/g, "");
	return ascii || `untitled-${collection === "notes" ? "note" : "essay"}-${calendarDay(date)}`;
}

function validateRequest(request) {
	if (!request || typeof request.requestId !== "string" || !request.requestId.trim()
		|| request.requestId.length > 200 || !Object.hasOwn(schemas, request.collection)
		|| typeof request.slug !== "string" || request.slug.length > 100 || !SLUG.test(request.slug)) {
		throw serviceError(400, "invalid_draft", "Invalid draft creation request");
	}
	if (typeof request.title !== "string" || !request.title.trim() || /[\u0000-\u001f\u007f]/.test(request.title)
		|| (request.description !== undefined && typeof request.description !== "string")
		|| (request.collection === "essays" && (!request.description?.trim()
			|| /[\u0000-\u001f\u007f]/.test(request.description)))) {
		throw serviceError(422, "invalid_draft", "Draft metadata is invalid");
	}
	if (request.collection === "essays" && (typeof request.coverId !== "string" || !request.coverId)) {
		throw serviceError(422, "invalid_draft", "Choose a repository cover for the essay");
	}
}

function draftSource(metadata) {
	const rows = [
		"---", `title: ${JSON.stringify(metadata.title)}`,
		...(metadata.description ? [`description: ${JSON.stringify(metadata.description)}`] : []),
		`updated: ${metadata.updated}`, `startDate: ${metadata.startDate}`,
		`type: ${metadata.type}`, `growthStage: seedling`, "draft: true",
		...(metadata.cover ? [`cover: ${JSON.stringify(metadata.cover)}`] : []),
		"---", "", "",
	];
	return rows.join("\n");
}

/** Create flat, schema-valid drafts through one queue and an exclusive atomic install. */
export function createDraftService({ projectRoot, fs = defaultFs, now = () => new Date(),
	loadEntries, reservedRoutes, loadCovers, index } = {}) {
	if (!projectRoot || typeof loadEntries !== "function" || typeof reservedRoutes !== "function"
		|| !index || typeof index.refresh !== "function" || typeof index.resolve !== "function") {
		throw new TypeError("Draft service needs a project root, route sources, and document index");
	}
	let queue = Promise.resolve();
	const requests = new Map();
	const installed = new Map();
	const createdRoutes = new Set();
	const coverOptions = { projectRoot, fs, loadCovers };

	async function listCovers() {
		try {
			const covers = await listApprovedCovers(coverOptions);
			return { covers: covers.map(({ id, label, previewUrl }) => ({ id, label, previewUrl })) };
		} catch { throw serviceError(500, "file_io_error", "Repository covers could not be read"); }
	}

	async function refreshInstalled(result) {
		try {
			await index.refresh();
			await index.resolve(result.documentId);
			return result;
		} catch { throw serviceError(500, "file_io_error", "The new draft could not be indexed"); }
	}

	async function createOne(request) {
		validateRequest(request);
		if (installed.has(request.requestId)) return refreshInstalled(installed.get(request.requestId));
		const root = await fs.realpath(projectRoot).catch(() => {
			throw serviceError(500, "file_io_error", "The project could not be accessed");
		});
		const directory = join(root, "src/content", request.collection);
		async function assertTrustedDirectory() {
			try {
				if (await fs.realpath(directory) !== directory) {
					throw new Error("Draft directory changed");
				}
			} catch { throw serviceError(500, "file_io_error", "The draft directory is not trusted"); }
		}
		await assertTrustedDirectory();
		const target = join(directory, `${request.slug}.mdx`);
		let entries;
		let reserved;
		try {
			entries = [...await loadEntries(), ...index.list().map((item) => ({
				collection: item.collection, id: item.entryId, slug: item.slug,
			}))];
			reserved = await reservedRoutes();
		} catch { throw serviceError(500, "file_io_error", "Draft routes could not be checked"); }
		const routeOptions = { entries, reservedRoutes: reserved, createdRoutes: [...createdRoutes] };
		const fileExists = async (slug) => {
			for (const collection of ["notes", "essays"]) {
				try { await fs.lstat(join(root, "src/content", collection, `${slug}.mdx`)); return true; }
				catch (error) { if (error.code !== "ENOENT") throw error; }
			}
			return false;
		};
		const collides = async (slug) => findDraftRouteCollision(slug, routeOptions) || await fileExists(slug);
		const suggestedSlug = async () => {
			for (let suffix = 2; suffix < 10_000; suffix++) {
				const ending = `-${suffix}`;
				const base = request.slug.slice(0, 100 - ending.length).replace(/-+$/g, "");
				const next = `${base}${ending}`;
				if (!await collides(next)) return next;
			}
			return undefined;
		};
		try {
			if (await collides(request.slug)) {
				throw serviceError(409, "draft_collision", "A route or filename already uses this slug",
					{ suggestedSlug: await suggestedSlug() });
			}
		} catch (error) {
			if (error instanceof EditorServiceError) throw error;
			throw serviceError(500, "file_io_error", "Draft routes could not be checked");
		}
		const day = calendarDay(now());
		const metadata = { title: request.title.trim(), updated: day, startDate: day,
			type: request.collection === "notes" ? "note" : "essay", growthStage: "seedling", draft: true };
		if (request.description?.trim()) metadata.description = request.description.trim();
		if (request.collection === "essays") {
			let covers;
			try { covers = await listApprovedCovers(coverOptions); }
			catch { throw serviceError(500, "file_io_error", "Repository covers could not be read"); }
			const chosen = covers.find((cover) => cover.id === request.coverId);
			if (!chosen) throw serviceError(422, "invalid_draft", "Choose a valid repository cover");
			metadata.cover = relative(dirname(target), chosen.sourcePath).split(sep).join("/");
		}
		if (!schemas[request.collection].safeParse(metadata).success) {
			throw serviceError(422, "invalid_draft", "Draft metadata is invalid");
		}
		const source = draftSource(metadata);
		try { createSourceDocument(source); }
		catch { throw serviceError(422, "invalid_draft", "Draft source is invalid"); }
		const temp = join(directory, `.${request.slug}.${randomUUID()}.tmp`);
		let handle;
		try {
			await assertTrustedDirectory();
			handle = await fs.open(temp, "wx", 0o644);
			await handle.writeFile(source, "utf8");
			await handle.sync();
			await handle.close();
			handle = null;
			await assertTrustedDirectory();
			if (await fs.realpath(temp) !== temp) {
				throw serviceError(500, "file_io_error", "The temporary draft path changed");
			}
			await fs.link(temp, target);
		} catch (error) {
			try { await handle?.close(); } catch { /* Retain the original failure. */ }
			try { await fs.unlink(temp); } catch { /* The temp may not exist. */ }
			if (error instanceof EditorServiceError) throw error;
			if (error.code === "EEXIST") {
				throw serviceError(409, "draft_collision", "A file already uses this slug",
					{ suggestedSlug: await suggestedSlug() });
			}
			throw serviceError(500, "file_io_error", "The new draft could not be written");
		}
		try { await fs.unlink(temp); } catch { /* The installed draft is intact. */ }
		const documentId = `${request.collection}:${request.slug}`;
		const result = { documentId, revision: hash(source),
			editorUrl: `/_editor?documentId=${encodeURIComponent(documentId)}`,
			previewUrl: `/${request.slug}` };
		installed.set(request.requestId, result);
		createdRoutes.add(request.slug);
		return refreshInstalled(result);
	}

	function createDraft(request) {
		const id = request?.requestId;
		if (typeof id === "string" && requests.has(id)) return requests.get(id);
		const result = queue.then(() => createOne(request));
		queue = result.catch(() => {});
		if (typeof id === "string" && id) {
			requests.set(id, result);
			result.catch(() => { if (requests.get(id) === result) requests.delete(id); });
		}
		return result;
	}

	return { createDraft, listCovers,
		suggestSlug: (title, collection) => suggestDraftSlug(title, collection, now()) };
}

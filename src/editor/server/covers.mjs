import * as defaultFs from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import sharp from "sharp";

const IMAGE_EXTENSION = /\.(?:png|jpe?g)$/i;

function coverLabel(filename) {
	return filename.replace(/\.[^.]+$/, "").replace(/@\dx$/i, "")
		.replace(/[-_]+/g, " ").trim();
}

/** Enumerate only real, decodable raster files inside the repository cover directory. */
export async function listApprovedCovers({ projectRoot, fs = defaultFs, loadCovers } = {}) {
	const root = await fs.realpath(projectRoot);
	const expected = join(root, "src/images/covers");
	const coverRoot = await fs.realpath(expected);
	if (coverRoot !== expected) throw new Error("The repository cover directory is not trusted");
	const candidates = loadCovers ? await loadCovers() : (await fs.readdir(coverRoot, { withFileTypes: true }))
		.filter((item) => item.isFile())
		.map((item) => ({ id: item.name, sourcePath: join(coverRoot, item.name) }));
	const found = [];
	const ids = new Set();
	for (const candidate of candidates) {
		if (typeof candidate?.id !== "string" || !candidate.id || ids.has(candidate.id)
			|| typeof candidate.sourcePath !== "string") continue;
		const supplied = resolve(root, candidate.sourcePath);
		if (!IMAGE_EXTENSION.test(supplied)) continue;
		try {
			const path = await fs.realpath(supplied);
			if (!path.startsWith(`${coverRoot}${sep}`)) continue;
			const stat = await fs.stat(path);
			if (!stat.isFile()) continue;
			const image = sharp(path);
			const metadata = await image.metadata();
			if (!["png", "jpeg"].includes(metadata.format) || !metadata.width || !metadata.height) continue;
			await sharp(path).resize(1, 1).toBuffer();
			ids.add(candidate.id);
			found.push({ id: candidate.id, sourcePath: path,
				label: coverLabel(basename(path)),
				previewUrl: `/src/images/covers/${encodeURIComponent(basename(path))}` });
		} catch { /* Do not offer a missing, symlink-escaped, or corrupt image. */ }
	}
	return found.sort((left, right) => left.label.localeCompare(right.label));
}

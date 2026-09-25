import { hasValidCalendarDatePrefix } from "../utils/calendarDate.mjs";

export function createContentDate(z) {
	return z.unknown().refine(
		(value) => typeof value !== "string" || hasValidCalendarDatePrefix(value),
		"Invalid authored calendar date",
	).pipe(z.coerce.date());
}

export function createNoteSchema({ z, contentDate }) {
	return z.object({
		title: z.string(),
		description: z.string().optional(),
		aliases: z.array(z.string()).optional(),
		startDate: contentDate,
		updated: contentDate,
		type: z.literal("note"),
		topics: z.array(z.string()).optional(),
		growthStage: z.string(),
		draft: z.boolean().optional(),
		toc: z.boolean().optional(),
		version: z.number().optional(),
		versionSummary: z.string().optional(),
	});
}

export function createEssaySchema({ z, contentDate, image }) {
	return z.object({
		title: z.string(),
		description: z.string(),
		updated: contentDate,
		startDate: contentDate,
		type: z.literal("essay"),
		cover: image(),
		topics: z.array(z.string()).optional(),
		growthStage: z.string(),
		featured: z.boolean().optional(),
		draft: z.boolean().optional(),
		toc: z.boolean().optional(),
		aliases: z.array(z.string()).optional(),
		version: z.number().optional(),
		versionSummary: z.string().optional(),
	});
}

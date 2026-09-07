export const DESCRIPTION_MIN_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 160;

const GENERIC_SITE_DESCRIPTION =
  "Maggie's digital garden filled with visual essays on programming, design, and anthropology";

export const PAGE_DESCRIPTIONS = Object.freeze({
  home: "Maggie Appleton's digital garden of visual essays, notes, and patterns about programming, design, anthropology, and software.",
  about: "Designer, anthropologist, and mediocre developer.",
  garden: "A growing collection of essays, notes, talks, podcasts, and half-baked explorations, gathered and tended over time.",
  essays: "Opinionated, longform narrative writing with an agenda, collected in Maggie Appleton's digital garden.",
  notes: "Loose, unopinionated notes on things Maggie Appleton doesn't entirely understand yet.",
  patterns: "A catalogue of design patterns gathered from Maggie Appleton's own observations and research.",
  talks: "Occasional talks on visual programming, cultural anthropology, design tactics, software narratives, and the effects of thoughtless AI.",
  podcasts: "Interviews and casual chats on digital gardening, artificial intelligence, and metaphors, gathered from various podcasts.",
  now: "A sporadically updated log of what Maggie Appleton is reading, exploring, and thinking about.",
  smidgeons: "A stream of interesting links, papers, and tiny thoughts – roughly what Maggie Appleton is reading and thinking about.",
  library: "Books Maggie Appleton has read that significantly influenced how she sees the world.",
  antilibrary: "Books Maggie Appleton likes the idea of having read, collected in the site's antilibrary.",
  colophon: "How Maggie Appleton's digital garden was made, from its tools and typography to its content and visual design.",
});

export function isMeaningfulDescription(value, genericDescription) {
  const text = typeof value === "string" ? value.trim() : "";
  return Boolean(text) && text !== "..." && text !== genericDescription;
}

export function requirePageDescription(value, context, genericDescription) {
  if (!isMeaningfulDescription(value, genericDescription)) {
    throw new TypeError(context + ": page metadata requires a meaningful explicit description");
  }
  return value.trim();
}

export function assertP8DescriptionLength(value, context) {
  const length = [...value].length;
  if (length < DESCRIPTION_MIN_LENGTH || length > DESCRIPTION_MAX_LENGTH) {
    throw new RangeError(context + ": description must be 80-160 characters");
  }
  return value;
}

function requireInterpolatedTitle(value, context) {
  return requirePageDescription(value, context, GENERIC_SITE_DESCRIPTION);
}

export function describeTopic(topicName) {
  const topic = requireInterpolatedTitle(topicName, "describeTopic topicName");
  return assertP8DescriptionLength(
    `Essays, notes, patterns, and Smidgeons related to ${topic}, gathered from Maggie Appleton's digital garden.`,
    "describeTopic",
  );
}

export function describeNow(title) {
  const value = requireInterpolatedTitle(title, "describeNow title");
  return assertP8DescriptionLength(
    `A snapshot of what Maggie Appleton was reading, exploring, and thinking about in ${value}.`,
    "describeNow",
  );
}

export function describeSmidgeon(title) {
  const value = requireInterpolatedTitle(title, "describeSmidgeon title");
  return assertP8DescriptionLength(
    `A smidgeon from Maggie Appleton's reading stream – an interesting link, paper, or tiny thought: ${value}.`,
    "describeSmidgeon",
  );
}

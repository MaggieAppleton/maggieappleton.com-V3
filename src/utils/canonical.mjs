import {
  getPublicationBaseSlug,
  isVersionedPublicationEntry,
} from "./publication.mjs";

export const CANONICAL_ORIGIN = "https://maggieappleton.com";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const DOT_PATH_SEGMENT = /^(?:\.|%2e){1,2}$/i;

function invalidCanonicalInput(input) {
  throw new TypeError(`Canonical URL input must be a root-relative path or a ${CANONICAL_ORIGIN} URL: ${String(input)}`);
}

function hasDotPathSegment(input) {
  const inputWithoutQueryOrHash = input.split(/[?#]/, 1)[0];
  const pathname = input.startsWith("/")
    ? inputWithoutQueryOrHash
    : inputWithoutQueryOrHash.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "") || "/";
  return pathname.split("/").some((segment) => DOT_PATH_SEGMENT.test(segment));
}

function parseCanonicalInput(input) {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.includes("\\") ||
    CONTROL_CHARACTER.test(input)
  ) invalidCanonicalInput(input);

  if (input.startsWith("//") || hasDotPathSegment(input)) invalidCanonicalInput(input);

  if (input.startsWith("/")) return new URL(input, CANONICAL_ORIGIN);

  let url;
  try {
    url = new URL(input);
  } catch {
    invalidCanonicalInput(input);
  }

  if (
    url.protocol !== "https:" ||
    url.origin !== CANONICAL_ORIGIN ||
    url.username ||
    url.password
  ) invalidCanonicalInput(input);

  return url;
}

/**
 * Returns a root-relative canonical pathname. Query parameters, fragments, and
 * non-root trailing slashes are deliberately omitted from canonical identity.
 *
 * @param {string} input
 * @returns {string}
 */
export function normalizeCanonicalPath(input) {
  const { pathname } = parseCanonicalInput(input);
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * @param {string} input
 * @returns {string}
 */
export function buildCanonicalUrl(input) {
  return `${CANONICAL_ORIGIN}${normalizeCanonicalPath(input)}`;
}

/**
 * Folder-versioned publication entries share their base route's identity.
 * Ordinary entries, including filenames with version-like suffixes, preserve
 * their request path.
 *
 * @param {import("./publication.mjs").PublicationEntry | null | undefined} entry
 * @param {string} requestPath
 * @returns {string}
 */
export function getEntryCanonicalPath(entry, requestPath) {
  const normalizedRequestPath = normalizeCanonicalPath(requestPath);
  if (!isVersionedPublicationEntry(entry)) return normalizedRequestPath;
  return normalizeCanonicalPath(`/${getPublicationBaseSlug(entry)}`);
}

/** A synchronous, stable identity shared by the browser and the local server. */
export function normaliseText(text) {
	return String(text).replace(/\s+/gu, " ").trim();
}

function stableValue(value) {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
	}
	return value;
}

export function hash(...parts) {
	const bytes = new TextEncoder().encode(JSON.stringify(stableValue(parts)));
	let value = 0xcbf29ce484222325n;
	for (const byte of bytes) {
		value ^= BigInt(byte);
		value = BigInt.asUintN(64, value * 0x100000001b3n);
	}
	return value.toString(16).padStart(16, "0");
}

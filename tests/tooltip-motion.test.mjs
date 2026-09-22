import assert from "node:assert/strict";
import test from "node:test";

import { getTooltipMotion } from "../src/utils/tooltipMotion.js";

test("uses the original shift-away timing for normal motion", () => {
	assert.deepEqual(getTooltipMotion(false), {
		duration: 500,
		animation: "shift-away",
	});
});

test("disables tooltip motion when reduced motion is requested", () => {
	assert.deepEqual(getTooltipMotion(true), {
		duration: 0,
		animation: false,
	});
});

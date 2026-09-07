import assert from "node:assert/strict";
import test from "node:test";

const helpers = await import("../src/components/mdx/imageLightbox.js").catch(() => ({}));

test("uses a compact eight-pixel lightbox viewport gutter", () => {
	assert.equal(helpers.getLightboxGutter?.(), 8);
});

test("fits a portrait image inside the viewport without cropping", () => {
	const result = helpers.fitImageRect?.({
		intrinsicWidth: 1000,
		intrinsicHeight: 2000,
		viewportWidth: 1200,
		viewportHeight: 800,
		gutter: 32,
		captionHeight: 0,
	});

	assert.deepEqual(result, {
		left: 416,
		top: 32,
		width: 368,
		height: 736,
	});
});

test("reserves caption space when fitting an image", () => {
	const result = helpers.fitImageRect?.({
		intrinsicWidth: 1600,
		intrinsicHeight: 900,
		viewportWidth: 1200,
		viewportHeight: 800,
		gutter: 32,
		captionHeight: 80,
	});

	assert.deepEqual(result, {
		left: 32,
		top: 40.5,
		width: 1136,
		height: 639,
	});
});

test("reserves room for a close control outside the image", () => {
	const result = helpers.fitImageRect?.({
		intrinsicWidth: 1000,
		intrinsicHeight: 2000,
		viewportWidth: 390,
		viewportHeight: 800,
		gutter: 12,
		captionHeight: 0,
		rightControlSpace: 56,
	});

	assert.deepEqual(result, {
		left: 12,
		top: 90,
		width: 310,
		height: 620,
	});
	assert.equal(result.left + result.width + 56, 378);
});

test("calculates the inverse transform from the destination back to the thumbnail", () => {
	const result = helpers.getFlipTransform?.(
		{ left: 100, top: 200, width: 200, height: 100 },
		{ left: 20, top: 40, width: 800, height: 400 },
	);

	assert.deepEqual(result, {
		translateX: 80,
		translateY: 160,
		scaleX: 0.25,
		scaleY: 0.25,
	});
});

test("wraps gallery navigation in either direction", () => {
	assert.equal(helpers.getWrappedIndex?.(0, 7, -1), 6);
	assert.equal(helpers.getWrappedIndex?.(6, 7, 1), 0);
	assert.equal(helpers.getWrappedIndex?.(3, 7, 1), 4);
});

test("accepts only deliberate horizontally dominant swipes", () => {
	assert.equal(
		helpers.getSwipeDirection?.({ startX: 100, startY: 20, endX: 35, endY: 30 }),
		1,
	);
	assert.equal(
		helpers.getSwipeDirection?.({ startX: 30, startY: 20, endX: 95, endY: 25 }),
		-1,
	);
	assert.equal(
		helpers.getSwipeDirection?.({ startX: 30, startY: 20, endX: 42, endY: 85 }),
		0,
	);
	assert.equal(
		helpers.getSwipeDirection?.({ startX: 30, startY: 20, endX: 55, endY: 24 }),
		0,
	);
});

test("uses a thumbnail as a close target only while it is fully visible", () => {
	assert.equal(
		helpers.isRectFullyVisible?.(
			{ left: 10, top: 20, right: 210, bottom: 320, width: 200, height: 300 },
			{ width: 1200, height: 800 },
		),
		true,
	);
	assert.equal(
		helpers.isRectFullyVisible?.(
			{ left: 10, top: -1, right: 210, bottom: 299, width: 200, height: 300 },
			{ width: 1200, height: 800 },
		),
		false,
	);
	assert.equal(
		helpers.isRectFullyVisible?.(
			{ left: 10, top: 700, right: 210, bottom: 1000, width: 200, height: 300 },
			{ width: 1200, height: 800 },
		),
		false,
	);
});

test("pins the page at its current scroll offset while the lightbox is open", () => {
	assert.deepEqual(
		helpers.getScrollLockStyles?.({
			scrollX: 24,
			scrollY: 997,
			scrollbarWidth: 15,
		}),
		{
			position: "fixed",
			top: "-997px",
			left: "-24px",
			right: "0",
			width: "100%",
			overflow: "hidden",
			paddingRight: "15px",
		},
	);
});

const round = (value) => Math.round(value * 1000) / 1000;

export function getLightboxGutter() {
	return 8;
}

export function fitImageRect({
	intrinsicWidth,
	intrinsicHeight,
	viewportWidth,
	viewportHeight,
	gutter,
	captionHeight = 0,
	rightControlSpace = 0,
}) {
	const availableWidth = Math.max(0, viewportWidth - gutter * 2 - rightControlSpace);
	const availableHeight = Math.max(0, viewportHeight - gutter * 2 - captionHeight);
	const scale = Math.min(
		availableWidth / intrinsicWidth,
		availableHeight / intrinsicHeight,
	);
	const width = intrinsicWidth * scale;
	const height = intrinsicHeight * scale;

	return {
		left: round(gutter + (availableWidth - width) / 2),
		top: round((viewportHeight - height - captionHeight) / 2),
		width: round(width),
		height: round(height),
	};
}

export function getFlipTransform(sourceRect, destinationRect) {
	return {
		translateX: round(sourceRect.left - destinationRect.left),
		translateY: round(sourceRect.top - destinationRect.top),
		scaleX: round(sourceRect.width / destinationRect.width),
		scaleY: round(sourceRect.height / destinationRect.height),
	};
}

export function getWrappedIndex(currentIndex, itemCount, direction) {
	if (itemCount <= 0) return 0;
	return (currentIndex + direction + itemCount) % itemCount;
}

export function getSwipeDirection(
	{ startX, startY, endX, endY },
	threshold = 44,
) {
	const deltaX = endX - startX;
	const deltaY = endY - startY;

	if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) {
		return 0;
	}

	return deltaX < 0 ? 1 : -1;
}

export function isRectFullyVisible(rect, viewport) {
	return (
		rect.width > 0 &&
		rect.height > 0 &&
		rect.left >= 0 &&
		rect.top >= 0 &&
		rect.right <= viewport.width &&
		rect.bottom <= viewport.height
	);
}

export function getScrollLockStyles({ scrollX, scrollY, scrollbarWidth }) {
	return {
		position: "fixed",
		top: `${-scrollY}px`,
		left: `${-scrollX}px`,
		right: "0",
		width: "100%",
		overflow: "hidden",
		paddingRight: scrollbarWidth > 0 ? `${scrollbarWidth}px` : "",
	};
}

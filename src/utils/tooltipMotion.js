export function getTooltipMotion(reducedMotion) {
	return reducedMotion
		? { duration: 0, animation: false }
		: { duration: 500, animation: "shift-away" };
}

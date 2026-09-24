export function placePopover({
  anchorX,
  anchorY,
  width,
  height,
  viewportWidth,
  viewportHeight,
  offset = 12,
  padding = 8,
}) {
  const placeLeft = anchorX + offset + width > viewportWidth - padding;
  const placeAbove = anchorY + offset + height > viewportHeight - padding;
  const preferredX = placeLeft
    ? anchorX - offset - width
    : anchorX + offset;
  const preferredY = placeAbove
    ? anchorY - offset - height
    : anchorY + offset;

  return {
    x: Math.min(
      Math.max(preferredX, padding),
      Math.max(padding, viewportWidth - width - padding),
    ),
    y: Math.min(
      Math.max(preferredY, padding),
      Math.max(padding, viewportHeight - height - padding),
    ),
    originX: placeLeft ? 'right' : 'left',
    originY: placeAbove ? 'bottom' : 'top',
  };
}

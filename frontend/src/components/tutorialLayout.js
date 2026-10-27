const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// All positions are in the overlay's local coordinates, not screen estimates.
export function getTutorialLayout(viewport, frame, measuredHeight) {
  const margin = 12;
  const top = 48;
  const bottom = Math.max(top + 40, viewport.height - 32);
  const width = Math.min(320, viewport.width - margin * 2);
  let highlight = null;
  if (frame && frame.y + frame.height > top && frame.y < bottom) {
    const x = clamp(frame.x - 5, 2, viewport.width - 2);
    const y = Math.max(top, frame.y - 5);
    highlight = {
      x, y,
      width: Math.max(0, Math.min(viewport.width - 2, frame.x + frame.width + 5) - x),
      height: Math.max(0, Math.min(bottom, frame.y + frame.height + 5) - y),
    };
  }
  const gap = 12;
  const aboveSpace = highlight ? Math.max(0, highlight.y - top - gap) : 0;
  const belowSpace = highlight ? Math.max(0, bottom - highlight.y - highlight.height - gap) : 0;
  const below = !!highlight && (belowSpace >= measuredHeight || belowSpace > aboveSpace);
  const maxHeight = highlight ? Math.max(40, below ? belowSpace : aboveSpace) : bottom - top;
  const height = Math.min(measuredHeight, maxHeight);
  const centerX = highlight ? highlight.x + highlight.width / 2 : viewport.width / 2;
  const x = clamp(centerX - width / 2, margin, viewport.width - width - margin);
  const y = highlight
    ? (below ? highlight.y + highlight.height + gap : highlight.y - gap - height)
    : clamp((viewport.height - height) / 2, top, bottom - height);
  return {
    highlight, below,
    bubble: { x, y: clamp(y, top, bottom - height), width, maxHeight },
    arrowX: clamp(centerX - x - 6, 16, width - 28),
  };
}

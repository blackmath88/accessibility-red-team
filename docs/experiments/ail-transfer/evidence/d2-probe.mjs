export default async function (broker, packet) {
  const { target, viewport, affectedText } = packet;

  // Open the target page
  await broker.call('open', { target, viewport });

  // Find all matches of the affected text
  const findResult = await broker.call('findText', { text: affectedText, max: 5 });
  if (findResult.count === 0) {
    return { error: 'Text not found', target, viewport };
  }

  // Get viewport dimensions
  const viewportInfo = await broker.call('viewport', {});

  // Prepare results for all matches
  const matches = [];
  for (const elem of findResult.elements) {
    const match = {
      handle: elem.handle,
      rect: elem.rect,
      style: {
        color: elem.style.color,
        backgroundColor: elem.style.backgroundColor,
        opacity: elem.style.opacity,
        position: elem.style.position,
        zIndex: elem.style.zIndex,
        visibility: elem.style.visibility,
        display: elem.style.display,
        fontSize: elem.style.fontSize,
        fontWeight: elem.style.fontWeight,
        top: elem.style.top
      },
      effectiveOpacity: elem.effectiveOpacity,
      nonDefaultAncestors: elem.nonDefaultAncestors
    };

    // Measure pixels inside the text rect
    const clip = {
      x: Math.round(elem.rect.x),
      y: Math.round(elem.rect.y),
      width: Math.min(800, Math.round(elem.rect.width)),
      height: Math.min(300, Math.round(elem.rect.height))
    };
    const pixelsResult = await broker.call('pixels', { clip });

    // Measure pixels in a reference background area (beside the text rect)
    const refClip = {
      x: Math.max(0, Math.round(elem.rect.x + elem.rect.width + 10)),
      y: Math.round(elem.rect.y),
      width: Math.min(800, Math.round(elem.rect.width)),
      height: Math.min(300, Math.round(elem.rect.height))
    };
    const refPixelsResult = await broker.call('pixels', { clip: refClip });

    // Sample points inside the text rect to detect covering elements
    const points = [];
    const stepX = Math.max(1, Math.floor(elem.rect.width / 3));
    const stepY = Math.max(1, Math.floor(elem.rect.height / 3));
    for (let x = elem.rect.x + stepX; x < elem.rect.x + elem.rect.width; x += stepX) {
      for (let y = elem.rect.y + stepY; y < elem.rect.y + elem.rect.height; y += stepY) {
        points.push({ x: Math.round(x), y: Math.round(y) });
      }
    }

    const coverageResult = await broker.call('elementsFromPoint', { points });

    // For each point, find the target element in the stack and report all overlying entries
    const pointCoverage = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const stack = coverageResult[i].stack;
      const targetIndex = stack.findIndex((entry) => 
        entry.text === affectedText || 
        (entry.cls && elem.cls && entry.cls.includes(elem.cls))
      );

      const overlying = [];
      if (targetIndex !== -1) {
        for (let j = 0; j < targetIndex; j++) {
          const entry = stack[j];
          const opacity = parseFloat(entry.opacity || '1');
          const bg = entry.backgroundColor || 'rgba(0,0,0,0)';
          const bgAlpha = parseFloat(bg.split(',')[3]?.replace(')', '') || '0');
          const combinedAlpha = opacity * bgAlpha;
          overlying.push({
            tag: entry.tag,
            id: entry.id,
            cls: entry.cls,
            position: entry.position,
            zIndex: entry.zIndex,
            backgroundColor: bg,
            opacity: entry.opacity,
            rect: entry.rect,
            effectiveOpacity: combinedAlpha
          });
        }
      }

      pointCoverage.push({
        point,
        targetIndex,
        overlying
      });
    }

    match.pixels = pixelsResult;
    match.refPixels = refPixelsResult;
    match.coverage = {
      pointsSampled: points.length,
      pointCoverage
    };

    matches.push(match);
  }

  // Take a screenshot of the viewport
  const screenshotResult = await broker.call('screenshot', {});

  return {
    target,
    viewport,
    matches,
    screenshot: screenshotResult.artifact,
    viewportInfo
  };
}
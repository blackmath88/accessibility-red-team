export default async function (broker, packet) {
  const { target, viewport, affectedText } = packet;
  
  // Open the target page
  await broker.call('open', { target, viewport });
  
  // Find the text element
  const findResult = await broker.call('findText', { text: affectedText, max: 1 });
  if (findResult.count === 0) {
    return { error: 'Text not found', target, viewport };
  }
  const textElement = findResult.elements[0];
  
  // Get viewport dimensions
  const viewportInfo = await broker.call('viewport', {});
  
  // Check if text rect is within viewport bounds
  const withinBounds = 
    textElement.rect.x >= 0 &&
    textElement.rect.y >= 0 &&
    textElement.rect.x + textElement.rect.width <= viewportInfo.innerWidth &&
    textElement.rect.y + textElement.rect.height <= viewportInfo.innerHeight;
  
  // Check effective opacity and visibility
  const visible = textElement.effectiveOpacity > 0 && textElement.style.visibility === 'visible';
  
  // Sample points inside the text rect to check for covering elements
  const points = [];
  const stepX = Math.max(1, Math.floor(textElement.rect.width / 3));
  const stepY = Math.max(1, Math.floor(textElement.rect.height / 3));
  for (let x = textElement.rect.x + stepX; x < textElement.rect.x + textElement.rect.width; x += stepX) {
    for (let y = textElement.rect.y + stepY; y < textElement.rect.y + textElement.rect.height; y += stepY) {
      points.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  
  const coverageResult = await broker.call('elementsFromPoint', { points });
  
  // Determine if any covering element is opaque
  let covered = false;
  for (const entry of coverageResult) {
    const topElement = entry.stack[0];
    if (topElement) {
      const bg = topElement.backgroundColor || 'rgba(0,0,0,0)';
      const isOpaque = bg !== 'rgba(0, 0, 0, 0)' && parseFloat(bg.split(',')[3] || '1') > 0.5;
      if (isOpaque) {
        covered = true;
        break;
      }
    }
  }
  
  return {
    target,
    viewport,
    textElement: {
      handle: textElement.handle,
      rect: textElement.rect,
      effectiveOpacity: textElement.effectiveOpacity,
      visibility: textElement.style.visibility,
      withinViewportBounds: withinBounds
    },
    coverage: {
      pointsSampled: points.length,
      isCovered: covered
    },
    visibilityStatus: visible && !covered
  };
}
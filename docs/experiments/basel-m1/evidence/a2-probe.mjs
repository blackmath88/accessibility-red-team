export default async function (broker, packet) {
  const { target, viewport } = packet;
  
  // Open the target with the given viewport
  await broker.call('open', { target, viewport });
  
  // Helper to get viewport state
  const getViewport = async () => {
    return await broker.call('viewport', {});
  };
  
  // Helper to find the hint element by text
  const findHint = async () => {
    const result = await broker.call('findText', { text: '* muss ausgefüllt werden', max: 1 });
    if (result.elements.length === 0) {
      throw new Error('hint not found');
    }
    return result.elements[0];
  };
  
  // Helper to scroll to a specific y position
  const scrollTo = async (y) => {
    return await broker.call('scrollTo', { y });
  };
  
  // Helper to get elementsFromPoint with error handling
  const getElementsFromPoint = async (points) => {
    try {
      return await broker.call('elementsFromPoint', { points });
    } catch (e) {
      return { error: e.message, points };
    }
  };
  
  // Helper to get pixels with error handling and clip to viewport
  const getPixels = async (rect) => {
    const viewport = await getViewport();
    // Clip rect to viewport bounds
    const clip = {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.min(rect.width, viewport.innerWidth - Math.max(0, rect.x)),
      height: Math.min(rect.height, viewport.innerHeight - Math.max(0, rect.y))
    };
    if (clip.width <= 0 || clip.height <= 0) {
      return { error: 'clip empty', rect, viewport };
    }
    try {
      return await broker.call('pixels', { clip });
    } catch (e) {
      return { error: e.message, clip };
    }
  };
  
  // Measure at multiple scroll positions
  const scrollPositions = [0, 8, 24, 48, Math.round(viewport.innerHeight / 2)];
  const results = [];
  
  for (const scrollY of scrollPositions) {
    let viewportState, hint, elementsFromPoint, pixels;
    
    try {
      // Scroll to position
      await scrollTo(scrollY);
      viewportState = await getViewport();
      
      // Find hint
      hint = await findHint();
      
      // Get elementsFromPoint at 3 points inside hint rect
      const points = [
        { x: Math.round(hint.rect.x + hint.rect.width * 0.25), y: Math.round(hint.rect.y + hint.rect.height * 0.25) },
        { x: Math.round(hint.rect.x + hint.rect.width * 0.75), y: Math.round(hint.rect.y + hint.rect.height * 0.25) },
        { x: Math.round(hint.rect.x + hint.rect.width * 0.5), y: Math.round(hint.rect.y + hint.rect.height * 0.75) }
      ];
      elementsFromPoint = await getElementsFromPoint(points);
      
      // Get pixels inside hint rect
      pixels = await getPixels(hint.rect);
      
      results.push({
        scrollY,
        viewport: viewportState,
        hint: {
          ...hint,
          effectiveOpacity: hint.style.opacity ? parseFloat(hint.style.opacity) : 1
        },
        elementsFromPoint,
        pixels
      });
    } catch (e) {
      results.push({
        scrollY,
        error: e.message,
        viewport: viewportState,
        hint,
        elementsFromPoint,
        pixels
      });
    }
  }
  
  return { scrollPositions, results };
}
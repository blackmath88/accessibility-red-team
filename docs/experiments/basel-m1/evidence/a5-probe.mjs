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
  
  // Helper to check if the hint is occluded by a fixed banner
  const isOccludedByBanner = (stack, hintRect) => {
    if (!stack || stack.length === 0) return false;
    const top = stack[0];
    // Fixed banner pattern: position fixed, zIndex high, backgroundColor distinct
    const isFixedBanner = top.position === 'fixed' && 
                          (top.zIndex === '99999' || parseInt(top.zIndex) > 1000) &&
                          top.backgroundColor && 
                          (top.backgroundColor.includes('221, 236, 222') || 
                           top.backgroundColor.includes('rgb(221, 236, 222)'));
    if (!isFixedBanner) return false;
    // Check if banner covers the hint
    return top.rect.y <= hintRect.y + hintRect.height &&
           top.rect.y + top.rect.height >= hintRect.y;
  };
  
  // Helper to compute a scroll position that avoids the fixed banner
  const computeSafeScrollY = (viewportState, hintRect, bannerRect) => {
    if (!bannerRect) return 0;
    // Target: center the hint in the viewport, above the banner
    const targetY = hintRect.y - Math.floor((bannerRect.y - hintRect.height) / 2);
    // Clamp to valid scroll range
    const minScroll = 0;
    const maxScroll = Math.max(0, viewportState.docHeight - viewportState.innerHeight);
    return Math.max(minScroll, Math.min(maxScroll, targetY));
  };
  
  // Measure at multiple scroll positions
  const scrollPositions = [0, 8, 24, 48];
  const results = [];
  
  for (const scrollY of scrollPositions) {
    let viewportState, hint, elementsFromPoint, pixels, occluderInfo;
    
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
      
      // Check for occlusion by fixed banner
      const isOccluded = isOccludedByBanner(elementsFromPoint.results?.[0]?.stack, hint.rect);
      occluderInfo = isOccluded ? { type: 'fixed-banner', stack: elementsFromPoint.results?.[0]?.stack } : null;
      
      // Only measure pixels if not occluded
      if (!isOccluded) {
        pixels = await getPixels(hint.rect);
      } else {
        pixels = { occluded: true, occluder: occluderInfo };
      }
      
      results.push({
        scrollY,
        viewport: viewportState,
        hint: {
          ...hint,
          effectiveOpacity: hint.style.opacity ? parseFloat(hint.style.opacity) : 1,
          nonDefaultAncestors: hint.nonDefaultAncestors || []
        },
        elementsFromPoint,
        pixels,
        occluderInfo
      });
    } catch (e) {
      results.push({
        scrollY,
        error: e.message,
        viewport: viewportState,
        hint,
        elementsFromPoint,
        pixels,
        occluderInfo
      });
    }
  }
  
  // Add a safe scroll position for mobile viewports if needed
  const viewportState = await getViewport();
  if (viewportState.innerWidth <= 400) {
    try {
      // Find hint again in case viewport changed
      const hint = await findHint();
      // Check for fixed banner
      const points = [
        { x: Math.round(hint.rect.x + hint.rect.width * 0.5), y: Math.round(hint.rect.y + hint.rect.height * 0.5) }
      ];
      const elementsFromPoint = await getElementsFromPoint(points);
      const isOccluded = isOccludedByBanner(elementsFromPoint.results?.[0]?.stack, hint.rect);
      
      if (isOccluded) {
        const bannerRect = elementsFromPoint.results?.[0]?.stack?.[0]?.rect;
        const safeScrollY = computeSafeScrollY(viewportState, hint.rect, bannerRect);
        await scrollTo(safeScrollY);
        const viewportAfterScroll = await getViewport();
        const elementsAfterScroll = await getElementsFromPoint(points);
        const pixelsAfterScroll = await getPixels(hint.rect);
        
        results.push({
          scrollY: safeScrollY,
          viewport: viewportAfterScroll,
          hint: {
            ...hint,
            effectiveOpacity: hint.style.opacity ? parseFloat(hint.style.opacity) : 1,
            nonDefaultAncestors: hint.nonDefaultAncestors || []
          },
          elementsFromPoint: elementsAfterScroll,
          pixels: pixelsAfterScroll,
          occluderInfo: { type: 'fixed-banner', stack: elementsAfterScroll.results?.[0]?.stack }
        });
      }
    } catch (e) {
      results.push({
        scrollY: 'mobile-safe-scroll',
        error: e.message
      });
    }
  }
  
  return { scrollPositions, results };
}
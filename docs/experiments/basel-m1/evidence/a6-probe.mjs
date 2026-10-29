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
  
  // Helper to check if the hint is occluded by a fixed element above it in the stack
  const isOccludedByFixed = (stack, hintRect) => {
    if (!stack || stack.length === 0) return false;
    // Find the hint span in the stack (by rect match)
    const hintIndex = stack.findIndex(el => 
      el.rect && 
      Math.abs(el.rect.x - hintRect.x) < 2 && 
      Math.abs(el.rect.y - hintRect.y) < 2 &&
      Math.abs(el.rect.width - hintRect.width) < 2 &&
      Math.abs(el.rect.height - hintRect.height) < 2
    );
    if (hintIndex === -1) return false;
    // Check if any element above the hint has position 'fixed'
    for (let i = 0; i < hintIndex; i++) {
      if (stack[i].position === 'fixed') {
        return { occluderTop: stack[i].rect.y, occluderIndex: i };
      }
    }
    return false;
  };
  
  // Helper to compute a safe scroll position to avoid the fixed occluder
  const computeSafeScrollY = (currentScrollY, hintRect, occluderTop, viewportState) => {
    // Target: center the hint in the viewport, above the occluder
    const targetY = currentScrollY + hintRect.y - Math.max(8, Math.floor((occluderTop - hintRect.height) / 2));
    // Clamp to valid scroll range
    const minScroll = 0;
    const maxScroll = Math.max(0, viewportState.docHeight - viewportState.innerHeight);
    return Math.max(minScroll, Math.min(maxScroll, targetY));
  };
  
  // Measure at initial scroll position (0) and, if occluded, at a safe scroll position
  const scrollPositions = [0];
  const results = [];
  
  // Initial state
  try {
    const viewportState = await getViewport();
    const hint = await findHint();
    
    // Get elementsFromPoint at 3 points inside hint rect
    const points = [
      { x: Math.round(hint.rect.x + hint.rect.width * 0.25), y: Math.round(hint.rect.y + hint.rect.height * 0.25) },
      { x: Math.round(hint.rect.x + hint.rect.width * 0.75), y: Math.round(hint.rect.y + hint.rect.height * 0.25) },
      { x: Math.round(hint.rect.x + hint.rect.width * 0.5), y: Math.round(hint.rect.y + hint.rect.height * 0.75) }
    ];
    const elementsFromPoint = await getElementsFromPoint(points);
    
    // Check for occlusion by fixed elements
    const occlusion = isOccludedByFixed(elementsFromPoint, hint.rect);
    let pixels, occluderInfo = null;
    
    if (!occlusion) {
      pixels = await getPixels(hint.rect);
    } else {
      pixels = { occluded: true, occluder: occlusion };
      occluderInfo = occlusion;
    }
    
    results.push({
      scrollY: viewportState.scrollY,
      viewport: viewportState,
      hint: {
        ...hint,
        nonDefaultAncestors: hint.nonDefaultAncestors || []
      },
      elementsFromPoint,
      pixels,
      occluderInfo
    });
    
    // If occluded, compute and measure safe scroll state
    if (occlusion) {
      const safeScrollY = computeSafeScrollY(viewportState.scrollY, hint.rect, occlusion.occluderTop, viewportState);
      if (safeScrollY !== viewportState.scrollY) {
        await scrollTo(safeScrollY);
        const viewportAfterScroll = await getViewport();
        const hintAfterScroll = await findHint();
        
        // Re-measure elementsFromPoint at the same points (now in new scroll state)
        const pointsAfterScroll = [
          { x: Math.round(hintAfterScroll.rect.x + hintAfterScroll.rect.width * 0.25), y: Math.round(hintAfterScroll.rect.y + hintAfterScroll.rect.height * 0.25) },
          { x: Math.round(hintAfterScroll.rect.x + hintAfterScroll.rect.width * 0.75), y: Math.round(hintAfterScroll.rect.y + hintAfterScroll.rect.height * 0.25) },
          { x: Math.round(hintAfterScroll.rect.x + hintAfterScroll.rect.width * 0.5), y: Math.round(hintAfterScroll.rect.y + hintAfterScroll.rect.height * 0.75) }
        ];
        const elementsAfterScroll = await getElementsFromPoint(pointsAfterScroll);
        
        // Check occlusion again after scroll
        const occlusionAfterScroll = isOccludedByFixed(elementsAfterScroll, hintAfterScroll.rect);
        let pixelsAfterScroll, occluderInfoAfterScroll = null;
        
        if (!occlusionAfterScroll) {
          pixelsAfterScroll = await getPixels(hintAfterScroll.rect);
        } else {
          pixelsAfterScroll = { occluded: true, occluder: occlusionAfterScroll };
          occluderInfoAfterScroll = occlusionAfterScroll;
        }
        
        results.push({
          scrollY: safeScrollY,
          viewport: viewportAfterScroll,
          hint: {
            ...hintAfterScroll,
            nonDefaultAncestors: hintAfterScroll.nonDefaultAncestors || []
          },
          elementsFromPoint: elementsAfterScroll,
          pixels: pixelsAfterScroll,
          occluderInfo: occluderInfoAfterScroll
        });
      }
    }
  } catch (e) {
    results.push({
      error: e.message,
      scrollY: 'initial'
    });
  }
  
  return { scrollPositions, results };
}
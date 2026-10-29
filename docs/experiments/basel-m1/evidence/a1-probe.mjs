export default async function (broker, packet) {
  const { target, viewport } = packet;
  
  // Open the target with the given viewport
  await broker.call('open', { target, viewport });
  
  // Helper to get viewport state
  const getViewport = async () => {
    return await broker.call('viewport', {});
  };
  
  // Helper to scroll to center the hint's center
  const scrollToCenterHint = async (hintRect) => {
    const viewport = await getViewport();
    const scrollY = Math.max(0, hintRect.y + hintRect.height / 2 - viewport.innerHeight / 2);
    return await broker.call('scrollTo', { y: scrollY });
  };
  
  // Helper to find the hint element
  const findHint = async () => {
    const result = await broker.call('query', { selector: 'span.text-xs', max: 1 });
    if (result.elements.length === 0) {
      throw new Error('hint not found');
    }
    return result.elements[0];
  };
  
  // Measure in unscrolled state
  const viewport0 = await getViewport();
  const hint0 = await findHint();
  const elementsFromPoint0 = await broker.call('elementsFromPoint', {
    points: [
      { x: hint0.rect.x + hint0.rect.width / 4, y: hint0.rect.y + hint0.rect.height / 4 },
      { x: hint0.rect.x + hint0.rect.width * 3 / 4, y: hint0.rect.y + hint0.rect.height / 4 },
      { x: hint0.rect.x + hint0.rect.width / 2, y: hint0.rect.y + hint0.rect.height / 2 }
    ]
  });
  const pixels0 = await broker.call('pixels', { clip: hint0.rect });
  
  // Scroll to center the hint
  await scrollToCenterHint(hint0.rect);
  const viewport1 = await getViewport();
  const hint1 = await findHint();
  const elementsFromPoint1 = await broker.call('elementsFromPoint', {
    points: [
      { x: hint1.rect.x + hint1.rect.width / 4, y: hint1.rect.y + hint1.rect.height / 4 },
      { x: hint1.rect.x + hint1.rect.width * 3 / 4, y: hint1.rect.y + hint1.rect.height / 4 },
      { x: hint1.rect.x + hint1.rect.width / 2, y: hint1.rect.y + hint1.rect.height / 2 }
    ]
  });
  const pixels1 = await broker.call('pixels', { clip: hint1.rect });
  
  return {
    viewport0,
    hint0: {
      ...hint0,
      effectiveOpacity: hint0.style.opacity ? parseFloat(hint0.style.opacity) : 1
    },
    elementsFromPoint0,
    pixels0,
    viewport1,
    hint1: {
      ...hint1,
      effectiveOpacity: hint1.style.opacity ? parseFloat(hint1.style.opacity) : 1
    },
    elementsFromPoint1,
    pixels1
  };
}
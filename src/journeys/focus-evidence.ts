export type FocusGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FocusObservation = {
  focusVisible: boolean;
  outlineStyle: string;
  outlineWidth: string;
  boxShadow: string;
  rect: FocusGeometry;
};

export function hasUsableFocusEvidence(
  observation: FocusObservation,
  viewport: { width: number; height: number },
): boolean {
  const { rect } = observation;
  const hasArea = rect.width > 0 && rect.height > 0;
  const intersectsViewport =
    rect.x + rect.width > 0 &&
    rect.y + rect.height > 0 &&
    rect.x < viewport.width &&
    rect.y < viewport.height;
  const outline = observation.outlineStyle !== "none" && observation.outlineWidth !== "0px";
  const shadow = observation.boxShadow !== "none";
  return hasArea && intersectsViewport && observation.focusVisible && (outline || shadow);
}

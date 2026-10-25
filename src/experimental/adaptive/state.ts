// The state identity shared by the executor (change detection, statesVisited) and the frontier ledger. Kept apart from both so
// neither imports the other.
import type { Observation } from "./contracts.js";

export function stateKey(observation: Observation, normalize: (url: string) => string): string {
  const expanded = observation.controls.filter((control) => control.expanded === "true").map((control) => control.name || control.ref).sort();
  const dialogs = observation.dialogs.filter((dialog) => dialog.visible).length;
  return `${normalize(observation.url)} | expanded=[${expanded.join(",")}] | dialogs=${dialogs}`;
}

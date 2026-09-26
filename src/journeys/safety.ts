import type { Locator } from "playwright";

export async function isSafeActivationTarget(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const form = element.closest("form");
    if (form) return false;

    const tag = element.tagName.toLowerCase();
    if (tag === "button") {
      const type = (element.getAttribute("type") ?? "submit").toLowerCase();
      return type === "button";
    }

    if (tag === "a") {
      const href = element.getAttribute("href") ?? "";
      return href.startsWith("#");
    }

    const role = element.getAttribute("role");
    return role === "button";
  }).catch(() => false);
}

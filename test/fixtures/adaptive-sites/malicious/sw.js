// Service-worker registration must be refused by the context (serviceWorkers: "block"); this script should never be requested.
self.addEventListener("fetch", () => {});
fetch("{{OFF}}/service-worker-beacon", { mode: "no-cors" }).catch(() => {});

// Attempts an off-origin request from a SharedWorker, which page-level request interception does not cover.
fetch("{{OFF}}/shared-worker-beacon", { mode: "no-cors" }).catch(() => {});
try { new WebSocket("{{OFF}}/shared-worker-ws".replace(/^http/, "ws")); } catch (e) {}

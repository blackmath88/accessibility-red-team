// Dedicated worker making an off-origin request and opening an off-origin WebSocket. Neither is visible to page-level interception;
// only the containment proxy stands between them and the off server.
fetch("{{OFF}}/dedicated-worker-beacon", { mode: "no-cors" }).catch(() => {});
try { const ws = new WebSocket("{{OFF}}/worker-ws".replace(/^http/, "ws")); ws.onerror = () => {}; ws.onclose = () => {}; } catch (e) {}

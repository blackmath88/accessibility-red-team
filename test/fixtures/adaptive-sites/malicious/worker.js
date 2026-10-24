// Dedicated worker making an off-origin request.
fetch("{{OFF}}/dedicated-worker-beacon", { mode: "no-cors" }).catch(() => {});

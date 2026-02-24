const EXCLUDED_PROTOCOLS = ["chrome:", "chrome-extension:", "about:", "devtools:"];

export function initFloatingButton() {
  try {
    if (EXCLUDED_PROTOCOLS.some((p) => location.protocol.startsWith(p))) return;
    if (document.getElementById("ai-bookmark-fab-host")) return;

    const host = document.createElement("div");
    host.id = "ai-bookmark-fab-host";
    host.setAttribute(
      "style",
      "all:initial!important;position:fixed!important;bottom:0!important;right:0!important;z-index:2147483647!important;width:0!important;height:0!important;overflow:visible!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:none!important;",
    );
    const shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
<style>
  .fab {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 2147483647;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(30, 30, 30, 0.85);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0.6;
    transition: opacity 0.2s, transform 0.2s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    pointer-events: auto;
  }
  .fab:hover {
    opacity: 1;
    transform: scale(1.08);
  }
  .fab svg { display: block; }
  .progress-ring { transform: rotate(-90deg); }
  .progress-bg {
    fill: none;
    stroke: rgba(255,255,255,0.15);
    stroke-width: 3;
  }
  .progress-fg {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.4s ease, stroke 0.3s;
  }
  .idle { stroke: #4ade80; }
  .active { stroke: #60a5fa; }
  .badge {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    line-height: 1;
    pointer-events: none;
  }
  .badge.visible { display: flex; }
  .bookmark-icon {
    fill: none;
    stroke: white;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
<button class="fab" title="AI Bookmark Organizer">
  <svg width="44" height="44" viewBox="0 0 44 44">
    <circle class="progress-bg" cx="22" cy="22" r="20" />
    <circle class="progress-ring progress-fg idle" cx="22" cy="22" r="20"
      stroke-dasharray="125.66" stroke-dashoffset="0" />
    <path class="bookmark-icon" d="M16 13h12a1 1 0 0 1 1 1v17l-7-4-7 4V14a1 1 0 0 1 1-1z" />
  </svg>
  <span class="badge"></span>
</button>`;

    const btn = shadow.querySelector(".fab") as HTMLButtonElement;
    const ring = shadow.querySelector(".progress-fg") as SVGCircleElement;
    const badge = shadow.querySelector(".badge") as HTMLSpanElement;
    const circumference = 2 * Math.PI * 20;

    function updateRing(queue: Array<{ status: string }>) {
      if (!queue || queue.length === 0) {
        ring.style.strokeDashoffset = "0";
        ring.classList.remove("active");
        ring.classList.add("idle");
        badge.classList.remove("visible");
        return;
      }

      const total = queue.length;
      const done = queue.filter(
        (t) => t.status === "done" || t.status === "error",
      ).length;
      const activeCount = total - done;
      const hasActive = activeCount > 0;

      if (hasActive) {
        ring.classList.remove("idle");
        ring.classList.add("active");
        const progress = done / total;
        ring.style.strokeDashoffset = String(
          circumference * (1 - progress),
        );
        badge.textContent = String(activeCount);
        badge.classList.add("visible");
      } else {
        ring.style.strokeDashoffset = "0";
        ring.classList.remove("active");
        ring.classList.add("idle");
        badge.classList.remove("visible");
      }
    }

    chrome.storage.local
      .get("task_queue")
      .then((result) => updateRing(result.task_queue ?? []))
      .catch(() => {});

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.task_queue) return;
      updateRing(changes.task_queue.newValue ?? []);
    });

    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_TASKS_PAGE" }).catch(() => {});
    });

    const target = document.body ?? document.documentElement;
    target.appendChild(host);
  } catch {
    // Silently fail — extension context may be invalidated
  }
}

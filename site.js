// Gear dialog (index.html)
(() => {
  const backdrop = document.getElementById("knob-backdrop");
  if (!backdrop) return;
  const dialog = backdrop.querySelector('[role="dialog"]');
  const blocks = dialog.querySelectorAll("[data-knob]");
  const label = document.getElementById("knob-label");
  const closeBtn = document.getElementById("knob-close");
  let open = -1, opener = null;

  function show(i) {
    open = (i + blocks.length) % blocks.length;
    blocks.forEach((b, j) => { b.hidden = j !== open; });
    label.textContent = blocks[open].dataset.label;
    dialog.setAttribute("aria-labelledby", "knob-title-" + (open + 1));
  }
  function openAt(i, btn) {
    opener = btn;
    show(i);
    backdrop.style.display = "flex";
    document.body.style.overflow = "hidden";
    setTimeout(() => closeBtn.focus(), 40);
  }
  function close() {
    open = -1;
    backdrop.style.display = "none";
    document.body.style.overflow = "";
    if (opener) setTimeout(() => opener.focus(), 0);
  }

  document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openAt(+b.dataset.open, b)));
  backdrop.addEventListener("click", e => { if (e.target === backdrop) close(); });
  closeBtn.addEventListener("click", close);
  dialog.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => show(open + +b.dataset.step)));
  window.addEventListener("keydown", e => {
    if (open < 0) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") show(open + 1);
    else if (e.key === "ArrowLeft") show(open - 1);
    else if (e.key === "Tab") {
      const f = dialog.querySelectorAll("button"), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();

// Altitude indicator (moonshot.html)
(() => {
  const bar = document.getElementById("alt-bar");
  if (!bar) return;
  const ORDER = ["pad", "engines", "s1", "s2", "s3", "guidance", "moon"];
  let active = null;

  function update() {
    const line = window.innerHeight * 0.45;
    let a = -1;
    ORDER.forEach((id, i) => { if (document.getElementById(id).getBoundingClientRect().top < line) a = i; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) a = ORDER.length - 1;
    if (a === active) return;
    active = a;
    ORDER.forEach((id, i) => {
      const state = i === a ? "on" : i < a ? "past" : "";
      document.querySelectorAll('[data-part="' + id + '"]').forEach(el => {
        if (state) el.dataset.state = state; else delete el.dataset.state;
        if (el.tagName === "BUTTON") { if (i === a) el.setAttribute("aria-current", "step"); else el.removeAttribute("aria-current"); }
      });
    });
    bar.setAttribute("aria-valuenow", a + 1);
  }
  function jump(id) {
    const el = document.getElementById(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => jump(b.dataset.go)));
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

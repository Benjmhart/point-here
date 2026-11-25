// point-here: boxes, numbers and arrows that show a person where to look or click on a web page.
// pointHere([{sel|text|el, label}], {say}) draws them; pointHere([]) clears. Self-contained, no dependencies, CSP-safe
// (only element.style and SVG built with the DOM: no inline <style>, no eval). The overlay never takes a click.
window.pointHere = (targets, opts = {}) => {
  const ID = "__point_here__", Z = "2147483647";
  const old = window.__pointHere;
  if (old) old.stop();
  if (!targets || !targets.length) return "cleared";
  // bright ones for dark pages, deep ones for light pages
  const LOUD = ["#ff00ff", "#ffff00", "#00ffff", "#39ff14", "#ff8c00", "#e00000", "#0050ff", "#8000ff"];

  // --- finding the targets: selector, visible text, or an element; same-origin iframes searched too ---
  const docs = (d, off = { x: 0, y: 0 }, out = []) => {
    out.push({ d, off });
    for (const f of d.querySelectorAll("iframe, frame")) {
      try {
        const r = f.getBoundingClientRect();
        if (f.contentDocument) docs(f.contentDocument, { x: off.x + r.left + f.clientLeft, y: off.y + r.top + f.clientTop }, out);
      } catch (e) { /* cross-origin: not reachable */ }
    }
    return out;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const CLICKABLE = "a, button, label, input, select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [onclick]";
  const byText = (d, text) => {
    const want = text.trim().toLowerCase().replace(/\s+/g, " ");
    const w = d.createTreeWalker(d.body || d.documentElement, NodeFilter.SHOW_TEXT);
    let best = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue.toLowerCase().replace(/\s+/g, " ");
      if (!t.includes(want) || !n.parentElement || !visible(n.parentElement)) continue;
      const el = n.parentElement.closest(CLICKABLE) || n.parentElement;
      if (t.trim() === want) return el;   // an exact match wins over a longer text that contains it
      best = best || el;
    }
    // input values and placeholders, aria-labels: text a person sees that is no text node
    for (const el of d.querySelectorAll("input, textarea, [aria-label], [placeholder], [title]")) {
      const t = [el.value, el.placeholder, el.getAttribute("aria-label"), el.title].join(" ").toLowerCase();
      if (t.includes(want) && visible(el)) return best || el;
    }
    return best;
  };
  const find = (t) => {
    if (t.el) return { el: t.el, off: { x: 0, y: 0 } };
    for (const { d, off } of docs(document)) {
      let el = null;
      try { el = t.sel ? d.querySelector(t.sel) : t.text ? byText(d, t.text) : null; } catch (e) { /* bad selector */ }
      if (el) return { el, off };
    }
    return null;
  };

  // --- colour: the loud colour that contrasts most with what is behind the target ---
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => { const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const behind = (el) => {
    const out = [];
    for (let e = el.parentElement || el; e && e.nodeType === 1; e = e.parentElement || (e.ownerDocument.defaultView.frameElement || null)) {
      const cs = e.ownerDocument.defaultView.getComputedStyle(e), c = rgb(cs.backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) out.push(c.slice(0, 3));
      if (out.length) break;   // the box is drawn just outside the target: on its nearest painted background
    }
    if (!out.length) out.push([255, 255, 255]);   // nothing painted: the browser's white
    return out;
  };
  const pick = (bgs) => LOUD.map((c) => ({ c, s: Math.min(...bgs.map((b) => ratio(hex(c), b))) })).sort((a, b) => b.s - a.s)[0];
  const ink = (c) => (ratio(hex(c), [0, 0, 0]) >= ratio(hex(c), [255, 255, 255]) ? "#000000" : "#ffffff");

  // --- drawing: one fixed layer over the page, an SVG for the arrows, a box and a label per target ---
  // every element starts from `all: initial`, its styles !important: the page's own CSS (svg { margin-top: -44px } on example.com) can't move it
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, style, ns) => {
    const e = ns ? document.createElementNS(NS, tag) : document.createElement(tag);
    // !important inline: beats even the page's own !important rules; clicks pass through unless a style says otherwise
    for (const [k, v] of Object.entries({ all: "initial", display: "block", boxSizing: "border-box", pointerEvents: "none", ...style }))
      e.style.setProperty(k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()), v, "important");
    return e;
  };
  const root = make("div", { position: "fixed", inset: "0", pointerEvents: "none", zIndex: Z, overflow: "visible" });
  root.id = ID;
  const svg = make("svg", { position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible" }, true);
  root.append(svg);
  const found = [], report = [];
  targets.forEach((t, i) => {
    const f = find(t), n = targets.length > 1 ? `${i + 1}  ` : "";
    if (!f) { report.push(`${i + 1}: not found (${t.sel || t.text})`); return; }
    const p = pick(behind(f.el)), c = p.c;
    const box = make("div", { position: "absolute", border: `5px solid ${c}`, borderRadius: "6px",
      boxShadow: "0 0 0 2px #000, inset 0 0 0 2px #fff" });
    box.dataset.pointHere = "box";
    const lab = make("div", { position: "absolute", background: c, color: ink(c), font: "bold 18px/1.2 system-ui, sans-serif",
      padding: "8px 12px", borderRadius: "8px", border: "2px solid #000", boxShadow: "0 0 0 2px #fff, 0 4px 14px rgba(0,0,0,.5)",
      whiteSpace: "nowrap", maxWidth: "60vw", overflow: "hidden", textOverflow: "ellipsis" });
    lab.textContent = n + (t.label || "look here");
    const stroke = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round", display: "inline" };
    const under = make("path", { ...stroke, stroke: "#000", strokeWidth: "10px" }, true);
    const line = make("path", { ...stroke, stroke: c, strokeWidth: "5px" }, true);
    svg.append(under, line);
    root.append(box, lab);
    found.push({ ...f, box, lab, under, line });
    report.push(`${i + 1}: ${t.sel || t.text || "element"} -> ${f.el.tagName.toLowerCase()}, ${c} (contrast ${p.s.toFixed(1)})`);
  });
  if (opts.say) report.push(`said: ${opts.say}`);
  const x = make("button", { position: "absolute", top: "8px", right: "8px", pointerEvents: "auto", font: "bold 20px/1 system-ui",
    width: "32px", height: "32px", borderRadius: "16px", border: "2px solid #fff", background: "#000", color: "#fff",
    cursor: "pointer", textAlign: "center", padding: "0" });
  x.textContent = "×"; x.title = "Clear (Esc)";
  x.onclick = () => window.__pointHere.stop();
  root.append(x);
  (document.body || document.documentElement).append(root);

  const set = (e, st) => { for (const [k, v] of Object.entries(st)) e.style.setProperty(k, v, "important"); };
  // --- placing: every frame, so the boxes follow scrolling, resizing and layout changes ---
  const place = (f) => {
    const r = f.el.getBoundingClientRect(), L = r.left + f.off.x - 8, T = r.top + f.off.y - 8, W = r.width + 16, H = r.height + 16;
    set(f.box, { left: L + "px", top: T + "px", width: W + "px", height: H + "px" });
    const lw = f.lab.offsetWidth, lh = f.lab.offsetHeight, vw = innerWidth, vh = innerHeight, gap = 70;
    // the side with the most room: above, below, left or right of the box
    const room = [["above", T], ["below", vh - T - H], ["left", L], ["right", vw - L - W]].sort((a, b) => b[1] - a[1])[0][0];
    let lx = L + W / 2 - lw / 2, ly = T - gap - lh;
    if (room === "below") ly = T + H + gap;
    if (room === "left") { lx = L - gap - lw; ly = T + H / 2 - lh / 2; }
    if (room === "right") { lx = L + W + gap; ly = T + H / 2 - lh / 2; }
    lx = Math.max(8, Math.min(vw - lw - 8, lx)); ly = Math.max(8, Math.min(vh - lh - 8, ly));
    set(f.lab, { left: lx + "px", top: ly + "px" });
    // arrow: from the label's edge to the box's nearest edge, with a head
    const sx = Math.max(lx, Math.min(lx + lw, L + W / 2)), sy = room === "above" ? ly + lh : room === "below" ? ly : ly + lh / 2;
    const ex = Math.max(L, Math.min(L + W, sx)), ey = room === "above" ? T : room === "below" ? T + H : Math.max(T, Math.min(T + H, sy));
    const ax = room === "left" ? L : room === "right" ? L + W : ex, a = Math.atan2(ey - sy, ax - sx), hl = 18;
    const head = (s) => `M${ax - hl * Math.cos(a - s)},${ey - hl * Math.sin(a - s)} L${ax},${ey} L${ax - hl * Math.cos(a + s)},${ey - hl * Math.sin(a + s)}`;
    const d = `M${sx},${sy} L${ax},${ey} ${head(0.5)}`;
    // the shape as CSS too: `all: initial` sets the `d` property to none, which beats the attribute in Chrome
    for (const l of [f.under, f.line]) { l.setAttribute("d", d); l.style.setProperty("d", `path("${d}")`, "important"); }
  };
  // three slow pulses to catch the eye, none if the person asked for reduced motion; driven from the frame loop, so the
  // page's CSS can't stop them
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now();
  let raf = 0;
  const tick = (now = t0) => {
    const e = now - t0, k = still || e > 3600 ? 1 : 1 + 0.05 * Math.sin((Math.PI * e) / 1200) ** 2;
    found.forEach((f) => { place(f); set(f.box, { transform: k === 1 ? "none" : `scale(${k.toFixed(3)})` }); });
    raf = requestAnimationFrame(tick);
  };
  const esc = (e) => { if (e.key === "Escape") window.__pointHere.stop(); };
  window.addEventListener("keydown", esc, true);
  window.__pointHere = { stop() {
    cancelAnimationFrame(raf); window.removeEventListener("keydown", esc, true);
    root.remove(); window.__pointHere = null;
  } };
  if (found.length) {
    const r = found[0].el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) found[0].el.scrollIntoView({ block: "center", inline: "center" });
  }
  tick();
  return report.join("\n");
};

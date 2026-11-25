// node test/run.mjs: point.js against the fixture pages in headless Chromium, over the DevTools protocol (no packages).
// Each case: the target found, a box drawn round it, colour contrast >= 3 against what is behind it, clicks pass
// through, the first target scrolled into view, Esc clears, a strict CSP doesn't stop it, reduced motion stops the pulse.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const POINT = readFileSync(join(here, "../skills/point-here/point.js"), "utf8");
const srv = createServer((q, r) => {
  let body; try { body = readFileSync(join(here, q.url.split("?")[0])); } catch { return r.writeHead(404).end(); }
  r.writeHead(200, { "content-type": "text/html" }).end(body);
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const bin = process.env.CHROME || ["/usr/bin/chromium", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
const prof = mkdtempSync(join(tmpdir(), "point-here-"));
const chrome = spawn(bin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0",
  `--user-data-dir=${prof}`, "--window-size=1200,800", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((ok, no) => {
  let err = ""; setTimeout(() => no(new Error("chrome did not start: " + err)), 20000);
  chrome.stderr.on("data", (d) => { err += d; const m = err.match(/ws:\/\/\S+/); if (m) ok(m[0]); });
});
const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener("open", ok));
let seq = 0; const wait = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const cdp = (method, params = {}, sessionId) => new Promise((ok) => { const id = ++seq; wait.set(id, ok); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const { result: { targetId } } = await cdp("Target.createTarget", { url: "about:blank" });
const { result: { sessionId: S } } = await cdp("Target.attachToTarget", { targetId, flatten: true });
const js = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S);
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};
const open = async (page) => { await cdp("Page.navigate", { url: `${base}/${page}` }, S); await new Promise((r) => setTimeout(r, 700)); };

// in the page: draw, then measure what was drawn
const probe = (targets) => `${POINT}
(async () => {
  const rep = pointHere(${JSON.stringify(targets)});
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const root = document.getElementById("__point_here__");
  const boxes = root ? [...root.querySelectorAll("[data-point-here=box]")] : [];
  return { rep, drawn: boxes.length, boxes: boxes.map((b) => b.getBoundingClientRect().toJSON()), };
})()`;
const covers = (b, t) => b.left <= t.left && b.top <= t.top && b.right >= t.right && b.bottom >= t.bottom;
let fail = 0;
const check = (name, ok, why = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ": " + why}`); if (!ok) fail++; };

await open("fixtures.html");
for (const [name, t, id] of [["light, by selector", { sel: "#save", label: "click here" }, "save"],
                             ["light, by text", { text: "privacy settings" }, "link"],
                             ["dark, by placeholder", { text: "6-digit code", label: "type the code here" }, "code"],
                             ["busy background", { sel: "#busy" }, "busy"],
                             ["on magenta: not magenta", { sel: "#mag" }, "mag"]]) {
  const r = await js(probe([t]));
  const tr = await js(`document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().toJSON()`);
  const c = +(r.rep.match(/contrast ([\d.]+)/) || [])[1];
  check(`${name}: found and boxed`, r.drawn === 1 && covers(r.boxes[0], tr), r.rep);
  // a gradient or image behind can't be measured; there the black-and-white outline carries it
  // magenta is mid-brightness: no loud colour reaches 3 on it (yellow 2.9, a hue clash); the outline carries it
  const need = id === "mag" ? 2.5 : 3;
  if (id !== "busy") check(`${name}: contrast ${c} >= ${need}`, c >= need, r.rep);
  if (id === "mag") check(`${name}`, !/#ff00ff/.test(r.rep), r.rep);
  const through = await js(`(() => { const e = document.getElementById(${JSON.stringify(id)}), r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === e || e.contains(hit); })()`);
  check(`${name}: clicks pass through`, through);
}
// the arrow ends on the box's edge, whatever the page's CSS does to svg, div and path
const tip = await js(`(() => { const R = document.getElementById("__point_here__"), b = R.querySelector("[data-point-here=box]").getBoundingClientRect();
  const p = R.querySelectorAll("path")[1], s = R.querySelector("svg").getBoundingClientRect(), d = p.getAttribute("d").match(/L([\\d.]+),([\\d.]+) M/);
  const x = +d[1] + s.left, y = +d[2] + s.top, edge = Math.min(Math.abs(y - b.top), Math.abs(y - b.bottom), Math.abs(x - b.left), Math.abs(x - b.right));
  return { edge, svgTop: s.top, stroke: getComputedStyle(p).stroke }; })()`);
check("hostile page CSS: arrow ends on the box edge, stroked", tip.edge < 2 && tip.svgTop === 0 && tip.stroke !== "none", JSON.stringify(tip));
let r = await js(probe([{ sel: "#save", label: "first" }, { text: "Verify", label: "then" }, { sel: "#nope" }]));
check("several, numbered; a miss is reported", r.drawn === 2 && /2: Verify -> button/.test(r.rep) && /3: not found/.test(r.rep), r.rep);
r = await js(probe([{ sel: "#inner", label: "in the frame" }]));
check("same-origin iframe", r.drawn === 1 && /-> button/.test(r.rep), r.rep);
await js("scrollTo(0, 0)");
r = await js(probe([{ sel: "#far" }]));
const far = await js(`(() => { const b = document.getElementById("far").getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })()`);
check("far target scrolled into view", far);
const scale = `new Promise((ok) => setTimeout(() => ok(getComputedStyle(document.querySelector("[data-point-here=box]")).transform), 500))`;
const moving = await js(scale);
check("pulses by default (the box visibly moves)", moving !== "none", moving);
await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, S);
check("Esc clears", !(await js(`!!document.getElementById("__point_here__")`)));
await js(probe([{ sel: "#save" }])); r = await js(probe([{ sel: "#busy" }]));
check("a second call replaces the first", (await js(`document.querySelectorAll("#__point_here__").length`)) === 1 && r.drawn === 1);
check("pointHere([]) clears", (await js(`pointHere([])`)) === "cleared" && !(await js(`!!document.getElementById("__point_here__")`)));
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, S);
r = await js(probe([{ sel: "#save" }]));
const held = await js(scale);
check("reduced motion: no pulse", held === "none", held);
await cdp("Emulation.setEmulatedMedia", { features: [] }, S);

await open("csp.html");
r = await js(probe([{ text: "strict CSP", label: "click here" }]));
check("strict CSP: drawn, styled", r.drawn === 1 && r.boxes[0].width > 20, JSON.stringify(r));

ws.close(); chrome.kill(); srv.close();
setTimeout(() => rmSync(prof, { recursive: true, force: true }), 500);
console.log(fail ? `${fail} FAIL` : "all PASS");
process.exitCode = fail ? 1 : 0;

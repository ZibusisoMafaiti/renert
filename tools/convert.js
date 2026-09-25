// One-off: turn the <x-dc> templates into plain static HTML. Usage: node convert.js <srcSiteDir> <outDir>
const fs = require("fs"), path = require("path");
const [src, out] = process.argv.slice(2);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const data = (s, n) => eval(s.match(new RegExp("const " + n + " = (\\[[\\s\\S]*?\\n\\])"))[1]);
const fill = (tpl, as, obj) => tpl.replace(new RegExp("\\{\\{ " + as + "\\.(\\w+) \\}\\}", "g"), (_, k) => esc(obj[k]));
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); if (i < 0 || j < 0) throw Error("missing " + a); return [i, j + b.length]; };
const cut = (s, a, b, repl) => { const [i, j] = between(s, a, b); return s.slice(0, i) + (typeof repl === "function" ? repl(s.slice(i, j)) : repl) + s.slice(j); };
const inner = (block, open, close) => block.slice(block.indexOf(">", block.indexOf(open)) + 1, block.lastIndexOf(close));

function page(file, extraCss, transform) {
  let s = fs.readFileSync(path.join(src, file), "utf8");
  const helmet = inner(s, "<helmet>", "</helmet>").replace(/\n<meta name="viewport"[^>]*>/, "");
  s = transform(s);
  // body: everything inside <x-dc>, minus helmet
  let body = inner(s, "<x-dc>", "</x-dc>");
  body = cut(body, "<helmet>", "</helmet>", "").replace(/^\s+/, "");
  // style-hover="…" → a class with a :hover rule (runtime marks these !important; transitions left
  // un-important so the reduced-motion rule still wins, per README)
  const hovers = new Map();
  body = body.replace(/<(\w+)([^>]*?) style-hover="([^"]*)"([^>]*)>/g, (m, tag, a, css, b) => {
    if (!hovers.has(css)) hovers.set(css, "h" + hovers.size);
    const cls = hovers.get(css), attrs = a + b;
    return /class="/.test(attrs) ? `<${tag}${attrs.replace(/class="/, `class="${cls} `)}>` : `<${tag} class="${cls}"${attrs}>`;
  });
  body = body.replace(/><\/img>/g, ">");
  if (/\{\{|<sc-|style-hover|onClick/.test(body)) throw Error(file + ": leftover template syntax: " + body.match(/.{60}(\{\{|<sc-|style-hover|onClick).{60}/)[0]);
  const hoverCss = [...hovers].map(([css, cls]) => "." + cls + ":hover { " + css.split(";").filter(Boolean)
    .map(d => d.trim().startsWith("transition") ? d : d + " !important").join("; ") + "; }").join("\n  ");
  const head = helmet.replace("</style>", "  " + hoverCss + "\n" + extraCss + "</style>");
  fs.writeFileSync(path.join(out, file), `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${head.trimEnd()}
</head>
<body>
${body.trimEnd()}
<script src="site.js"></script>
</body>
</html>
`);
}

// ---------- index.html ----------
page("index.html", `  @media (max-width: 759.98px) { .d-only { display: none !important; } }
  @media (min-width: 760px) { .m-only { display: none !important; } }
`, s => {
  const knobs = data(s, "KNOBS").map((k, i) => ({ ...k, i, num: String(i + 1).padStart(2, "0"), aria: "Open " + k.label }));
  const loop = tpl => knobs.map(k => fill(tpl, "k", k).replace(/onClick="[^"]*"/, `data-open="${k.i}"`)).join("");
  // desktop gears
  s = cut(s, '<sc-if value="{{ desktop }}"', "</sc-if>", blk => {
    const tpl = inner(blk, "<sc-for", "</sc-for>").replace('<button type="button"', '<button type="button" class="d-only"');
    return loop(tpl).trim();
  });
  // mobile grid
  s = cut(s, '<sc-if value="{{ mobile }}"', "</sc-if>", blk => {
    const grid = inner(blk, "<sc-if", "</sc-if>").trim();
    return cut(grid, "<sc-for", "</sc-for>", f => loop(inner(f, "<sc-for", "</sc-for>")).trim())
      .replace("<div style=", '<div class="m-only" style=');
  });
  // dialog: all gear content written out, one block shown at a time
  s = cut(s, '<sc-if value="{{ isOpen }}"', "</sc-if>", blk => {
    let d = inner(blk, "<sc-if", "</sc-if>").trim();
    d = d.replace('<div onClick="{{ close }}" style="position:fixed;inset:0;z-index:50;background:rgba(3,4,6,0.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;',
                  '<div id="knob-backdrop" style="display:none;position:fixed;inset:0;z-index:50;background:rgba(3,4,6,0.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);');
    d = d.replace('aria-labelledby="knob-title" onClick="{{ stop }}"', 'aria-labelledby="knob-title-1"');
    d = d.replace(">{{ cur.num }} · {{ cur.label }}<", ` id="knob-label">01 · Lab<`);
    d = d.replace(' ref="{{ closeRef }}" onClick="{{ close }}"', ' id="knob-close"');
    d = d.replace(' onClick="{{ prev }}"', ' data-step="-1"').replace(' onClick="{{ next }}"', ' data-step="1"');
    const a = d.indexOf('<h2 id="knob-title"'), b = d.indexOf("</div>", d.indexOf("</sc-for>")) + 6;
    const tpl = d.slice(a, b);
    const blocks = knobs.map(k => {
      let t = cut(tpl, "<sc-for", "</sc-for>", f => k.facts.map(x => fill(inner(f, "<sc-for", "</sc-for>"), "f", x)).join("").trim());
      t = fill(t, "cur", k).replace('id="knob-title"', `id="knob-title-${k.i + 1}"`);
      return `<div data-knob="${k.i}" data-label="${k.num} · ${esc(k.label)}"${k.i ? " hidden" : ""}>\n        ${t}\n        </div>`;
    });
    return d.slice(0, a) + blocks.join("\n        ") + d.slice(b);
  });
  return s;
});

// ---------- moonshot.html ----------
page("moonshot.html", `  [data-part] .pt { border: 1.5px solid #4b5462; background: transparent; }
  [data-state="past"] .pt { border-color: #ff7a2f; background: rgba(255,122,47,0.22); }
  [data-state="on"] .pt { border-color: #ff7a2f; background: #ff7a2f; }
  .sd { background: #262c36; }
  [data-state="on"] .sd, [data-state="past"] .sd, .sd[data-state="on"], .sd[data-state="past"] { background: #ff7a2f; }
  .lbl { display: none; }
  [data-state="on"] .lbl { display: block; }
  .pair { grid-template-columns: minmax(0,1fr); }
  @media (min-width: 900px) { .pair { grid-template-columns: minmax(0,1fr) 28px minmax(0,1fr); } }
  @media (max-width: 899.98px) { .d-only { display: none !important; } }
  @media (min-width: 900px) { .m-only { display: none !important; } }
`, s => {
  const pairs = data(s, "PAIRS");
  // altitude nav (desktop)
  s = cut(s, '<sc-if value="{{ desktop }}"', "</sc-if>", blk => inner(blk, "<sc-if", "</sc-if>").trim()
    .replace('<nav aria-label="Altitude" style=', '<nav aria-label="Altitude" class="d-only" style=')
    .replace(/ onClick="\{\{ go\.(\w+) \}\}"/g, ' data-go="$1" data-part="$1"')
    .replace(/ aria-current="\{\{ cur\.\w+ \}\}"/g, "")
    .replace(/<span style="([^"]*)border:1\.5px solid \{\{ c\.\w+\.bd \}\};background:\{\{ c\.\w+\.bg \}\};/g, '<span class="pt" style="$1')
    .replace(/<span style="([^"]*)background:\{\{ c\.\w+\.solid \}\};/g, '<span class="sd" style="$1')
    .replace(/<span style="([^"]*);display:\{\{ c\.\w+\.lbl \}\}/g, '<span class="lbl" style="$1'));
  // altitude bar (mobile)
  s = cut(s, '<sc-if value="{{ mobile }}"', "</sc-if>", blk => inner(blk, "<sc-if", "</sc-if>").trim()
    .replace('<div role="progressbar"', '<div id="alt-bar" class="m-only" role="progressbar"')
    .replace('aria-valuenow="{{ climbed }}"', 'aria-valuenow="0"')
    .replace(/<span style="flex:1;background:\{\{ c\.(\w+)\.solid \}\}">/g, '<span class="sd" data-part="$1" style="flex:1">'));
  // "Start at the launch pad"
  s = s.replace('<button type="button" onClick="{{ go.pad }}"', '<button type="button" data-go="pad"');
  // guidance header (desktop only)
  s = cut(s, '<sc-if value="{{ desktop }}"', "</sc-if>", blk => inner(blk, "<sc-if", "</sc-if>").trim()
    .replace("<div style=", '<div class="d-only" style='));
  // guidance rows
  s = cut(s, '<sc-for list="{{ pairs }}"', "</sc-for>", blk => {
    const tpl = inner(blk, "<sc-for", "</sc-for>").replace("grid-template-columns:{{ pairCols }};", "").replace('<div style="display:grid', '<div class="pair" style="display:grid');
    return pairs.map(p => fill(cut(tpl, "<sc-if", "</sc-if>", t => p.tags ? inner(t, "<sc-if", "</sc-if>").trim() : ""), "p", p)
      .replace(/\n\s*\n/g, "\n")).join("").trim();
  });
  return s;
});

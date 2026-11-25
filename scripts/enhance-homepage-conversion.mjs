// Add a measured diagnostic entry after the existing homepage header.
// Generated output only: original index.html is never modified.
import fs from "node:fs";
const homePath = "_site/index.html";
let home = fs.readFileSync(homePath, "utf8");
const start = fs.readFileSync("_site/start/index.html", "utf8");
if (home.includes("gwap-growth-entry-v1")) process.exit(0);
const analytics = start.match(/<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-[A-Z0-9]+"><\/script>\s*<script>[\s\S]*?<\/script>/i)?.[0];
if (!analytics || !analytics.includes("G-MZF7SR86XK")) throw new Error("Shared GA4 bootstrap missing");
if (/<script[^>]+src=["']https:\/\/www\.googletagmanager\.com\/gtag\/js/i.test(home) || /G-[A-Z0-9]{8,}/.test(home)) throw new Error("Homepage may already have GA4; check manually");
if (!/<\/head>/i.test(home) || !/<body\b[^>]*>/i.test(home)) throw new Error("Homepage markup anchor missing");
const css = '<style id="gwap-growth-entry-style">\n' +
'#gwap-growth-entry-v1{box-sizing:border-box;max-width:100%;min-width:0;overflow-x:clip;position:relative;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:15px clamp(18px,5vw,72px);background:#0a0c09;border-top:1px solid #242a20;border-bottom:1px solid #39432b;color:#eeeee7;font-family:Arial,Helvetica,sans-serif}\n' +
'#gwap-growth-entry-v1 *{box-sizing:border-box}\n' +
'#gwap-growth-entry-v1 .gwap-growth-copy{min-width:0;flex:1 1 220px;max-width:720px}\n' +
'#gwap-growth-entry-v1 .gwap-growth-kicker{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#caff00;font-weight:800}\n' +
'#gwap-growth-entry-v1 .gwap-growth-text{font-size:clamp(14px,1.35vw,17px);line-height:1.5;margin:5px 0 0;color:#d0d5cc}\n' +
'#gwap-growth-entry-v1 .gwap-growth-cta{min-width:0;max-width:100%;overflow-wrap:anywhere;display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 20px;white-space:normal;text-align:center;background:#caff00;color:#090c05;text-decoration:none;font-size:12px;font-weight:900;letter-spacing:.04em;border-radius:2px}\n' +
'#gwap-growth-entry-v1 .gwap-growth-cta:hover,#gwap-growth-entry-v1 .gwap-growth-cta:focus-visible{background:#e0ff6e;outline:2px solid #fff;outline-offset:2px}\n' +
'@media(max-width:620px){#gwap-growth-entry-v1{padding:17px 18px}#gwap-growth-entry-v1 .gwap-growth-cta{width:100%}}\n</style>';
const panel = '<section id="gwap-growth-entry-v1" aria-label="Free Growth Diagnostic">\n' +
'  <div class="gwap-growth-copy">\n' +
'    <div class="gwap-growth-kicker">GWAP Gang / Free business diagnostic</div>\n' +
'    <p class="gwap-growth-text">Know something could work better? Identify your biggest visible growth bottleneck and the next practical step.</p>\n' +
'  </div>\n' +
'  <a class="gwap-growth-cta" href="/revenue-leak-score/" data-gwap-track="gwap_route_selected" data-gwap-offer="revenue_leak_score" data-gwap-placement="home_growth_entry">Run Your Free Growth Diagnostic →</a>\n' +
'</section>';
home = home.replace(/<\/head>/i, css + "\n" + analytics + "\n</head>");
if (/<\/header>/i.test(home)) {
  home = home.replace(/<\/header>/i, (match) => match + "\n" + panel);
} else {
  home = home.replace(/<body\b[^>]*>/i, (match) => match + "\n" + panel);
}
if (!home.includes('id="gwap-growth-entry-v1"') || !home.includes('href="/revenue-leak-score/"')) throw new Error("CTA insertion failed");
fs.writeFileSync(homePath, home);
console.log("GWAP_HOME_CONVERSION_READY: CTA + GA4");

import fs from "node:fs";
import path from "node:path";

const CUTOFF = "2026-09-22";
const ROOTS = ["content/blog", "content/brief"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function unquote(value = "") {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s+/, "");
  const data = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = unquote(match[2]);
  }
  return { data, body };
}

function count(text, re) {
  return [...String(text || "").matchAll(re)].length;
}

function isEnforced(data) {
  const date = String(data.date || "").trim();
  if (!date) return true;
  return date >= CUTOFF;
}

function bool(value) {
  return /^(true|yes|1)$/i.test(String(value || "").trim());
}

function issue(issues, file, severity, code, message) {
  issues.push({ file, severity, code, message });
}

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const targets = files.length
  ? files.filter((file) => file.endsWith(".md") && fs.existsSync(file))
  : ROOTS.flatMap((root) => walk(root));

const issues = [];
let checked = 0;

for (const file of targets) {
  const raw = fs.readFileSync(file, "utf8");
  const { data, body } = parseFrontmatter(raw);
  if (!isEnforced(data)) continue;
  checked += 1;

  const title = String(data.title || "");
  const description = String(data.description || "");
  const approved = bool(data.editorialQaEmDashApproved);

  const titleDashes = count(title, /—/g);
  const descriptionDashes = count(description, /—/g);
  const bodyDashes = count(body, /—/g);

  if (!approved && titleDashes > 0) {
    issue(
      issues,
      file,
      "ERROR",
      "title_em_dash",
      "Title contains an em dash. Rewrite it or add editorialQaEmDashApproved: true after explicit human approval."
    );
  }

  if (!approved && descriptionDashes > 0) {
    issue(
      issues,
      file,
      "ERROR",
      "description_em_dash",
      "Description contains an em dash. Rewrite it or explicitly approve the exception."
    );
  }

  if (!approved && bodyDashes > 0) {
    issue(
      issues,
      file,
      bodyDashes >= 2 ? "ERROR" : "WARN",
      bodyDashes >= 2 ? "body_em_dash_excess" : "body_em_dash_review",
      `Body contains ${bodyDashes} em dash${bodyDashes === 1 ? "" : "es"}. Prefer cleaner sentence construction unless a human editor approves the exception.`
    );
  }

  const notBut = count(body, /\bnot\b[^.!?\n]{0,90}\bbut\b/gi);
  const notJust = count(body, /\bnot just\b[^.!?\n]{0,90}\bbut also\b/gi);
  if (notBut >= 3 || notJust >= 2) {
    issue(
      issues,
      file,
      "ERROR",
      "repetitive_contrast_formula",
      "Repeated not-X-but-Y style contrast formulas detected."
    );
  }

  const stock = [
    [/\bin today['’]s (?:fast[- ]paced|digital|rapidly evolving) (?:world|landscape)\b/gi, "stock_in_todays_world"],
    [/\bin a world where\b/gi, "stock_in_a_world_where"],
    [/\bdelve(?:s|d|ing)? into\b/gi, "stock_delve"],
    [/\bgame[- ]changer\b/gi, "stock_game_changer"],
    [/\bunlock(?:ing)? the (?:power|potential)\b/gi, "stock_unlock_power"],
    [/\blet that sink in\b/gi, "stock_let_that_sink_in"]
  ];

  for (const [re, code] of stock) {
    if (re.test(body)) {
      issue(
        issues,
        file,
        "WARN",
        code,
        "Stock AI phrasing detected. Rewrite it in specific, concrete language."
      );
    }
  }
}

console.log(`GWAP Editorial QA V0.1 checked ${checked} enforced file(s).`);

if (issues.length) {
  for (const item of issues) {
    console.error(`[${item.severity}] ${item.file} :: ${item.code} :: ${item.message}`);
  }
  console.error(
    "GWAP Editorial QA FAIL. New editorial content must receive a clean PASS before deployment."
  );
  process.exit(1);
}

console.log("GWAP Editorial QA PASS");

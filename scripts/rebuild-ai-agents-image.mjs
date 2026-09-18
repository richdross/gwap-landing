import fs from "node:fs";
import crypto from "node:crypto";

const payload = fs.readFileSync("_image_payloads/ai-agents-small-business-gwap.b64", "utf8").trim();
const bytes = Buffer.from(payload, "base64");
const digest = crypto.createHash("sha256").update(bytes).digest("hex");

if (digest !== "a6ceda4506377d1daec86a3e3c818f6f06ce229a4033c404c48b7749f39fd79e") {
  throw new Error(`AI agents image SHA-256 mismatch: ${digest}`);
}
if (bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
  throw new Error("AI agents image is not a complete JPEG");
}

fs.mkdirSync("public/images/blog", { recursive: true });
fs.writeFileSync("public/images/blog/ai-agents-small-business-gwap.jpg", bytes);
console.log(`Rebuilt verified AI agents JPEG (${bytes.length} bytes)`);

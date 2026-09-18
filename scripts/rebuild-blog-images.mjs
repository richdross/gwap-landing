import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const assets = [
  {
    name: "ai-automation-opportunities-gwap.webp",
    partsDir: "_image_payloads/ai-automation-opportunities-gwap",
    sha256: "c33db1f5c76fa162cdc1ff711f75e219a40ff296dc0aa28d45e4dff7a26194bd"
  },
  {
    name: "ai-automation-roi-gwap.webp",
    partsDir: "_image_payloads/ai-automation-roi-gwap",
    sha256: "dac6d816a8658bd62df97fe3056b68318af00842aa98812725dbc3abb8da6058"
  },
  {
    name: "ai-agents-small-business-gwap.webp",
    partsDir: "_image_payloads/ai-agents-small-business-gwap",
    sha256: "ac8e23df91a7437d127c5eb1335e327b22a2accb735ca1fbc4e96ab3fe35e23b"
  }
];

for (const asset of assets) {
  const parts = fs.readdirSync(asset.partsDir)
    .filter((name) => name.endsWith(".txt"))
    .sort();

  if (!parts.length) throw new Error(`No payload parts found for ${asset.name}`);

  const encoded = parts
    .map((name) => fs.readFileSync(path.join(asset.partsDir, name), "utf8").trim())
    .join("");

  const bytes = Buffer.from(encoded, "base64");
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");

  if (digest !== asset.sha256) {
    throw new Error(`SHA-256 mismatch for ${asset.name}: ${digest}`);
  }

  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
      bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new Error(`Invalid WebP signature for ${asset.name}`);
  }

  const declaredSize = bytes.readUInt32LE(4) + 8;
  if (declaredSize !== bytes.length) {
    throw new Error(`Truncated WebP for ${asset.name}: RIFF declares ${declaredSize}, actual ${bytes.length}`);
  }

  const output = path.join("public/images/blog", asset.name);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, bytes);
  console.log(`Rebuilt ${output} (${bytes.length} bytes, sha256 ${digest})`);
}

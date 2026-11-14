#!/usr/bin/env bash
# Regenerate the TypeScript clients from the built contracts. Owner: Pranav (issue #10).
# Run from the repo root after any contract change:  npm run bindings
set -euo pipefail
cd "$(dirname "$0")/.."

[ "${SKIP_BUILD:-}" = 1 ] || stellar contract build

gen() { # <wasm name> <package name>
  local out="packages/$2"
  stellar contract bindings typescript \
    --wasm "target/wasm32v1-none/release/$1.wasm" \
    --output-dir "$out" \
    --overwrite
  # Use our package name and the SDK version the rest of the repo is pinned to.
  node -e '
    const fs = require("fs");
    const p = process.argv[1] + "/package.json";
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    j.name = process.argv[2];
    j.private = true;
    // Consumers (tsx, Vite) import the TypeScript source directly: no build step needed.
    j.exports = "./src/index.ts";
    delete j.typings;
    delete j.scripts;
    delete j.devDependencies;
    j.dependencies["@stellar/stellar-sdk"] = "17.4.0";
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  ' "$out" "$2"
  rm -f "$out/tsconfig.json" "$out/.gitignore"
  # The generated file assumes a browser `window`; make it compile for Node too.
  node -e '
    const fs = require("fs");
    const p = process.argv[1] + "/src/index.ts";
    const s = fs.readFileSync(p, "utf8")
      .replace(/if \(typeof window !== "undefined"\) \{[\s\S]*?\n\}/, "(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;");
    fs.writeFileSync(p, s);
  ' "$out"
}

gen raterace raterace-client
gen mock_oracle oracle-client

npm install
npm run typecheck
echo "Bindings regenerated: packages/raterace-client, packages/oracle-client"

// Testnet deploy. Owner: Pranav (issue #10). Run from the repo root: npm run deploy
//
// Builds a complete RateRace environment on Stellar testnet:
//   accounts -> test USDC (+ its Stellar Asset Contract) -> mock oracle -> RateRace contract
//   -> three registered, bonded, active anchors -> .env + deployments/testnet.json
//
// Accounts are reused from an existing .env (so addresses stay stable); contracts are
// always deployed fresh, so every run starts from a clean state. Use `npm run deploy -- --fresh`
// to generate new accounts too (needed after a testnet reset wipes the old ones).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
  rpc,
} from "@stellar/stellar-sdk";
import { PORTS, TESTNET, explorerAccount, explorerContract, type Deployment } from "@raterace/shared";
import { REPO_ROOT } from "@raterace/shared/node";

// ---------- settings ----------

const RPC_URL = TESTNET.rpcUrl;
const HORIZON_URL = TESTNET.horizonUrl;
const PASSPHRASE = TESTNET.networkPassphrase;
const WASM_DIR = resolve(REPO_ROOT, "target/wasm32v1-none/release");
const ENV_PATH = resolve(REPO_ROOT, ".env");
const FRESH = process.argv.includes("--fresh");
const SKIP_BUILD = process.argv.includes("--skip-build");

const UNIT = 10_000_000n; // 7 decimals
const usdc = (n: number) => (BigInt(n) * UNIT).toString();

// USD per 1 MXN, 14 decimals. ILLUSTRATIVE default (0.05 = 20 MXN per USD).
// Replace with a real sourced rate before the demo: MOCK_MXN_USD_PRICE=... npm run deploy
const MXN_PRICE = process.env.MOCK_MXN_USD_PRICE || "5000000000000";

const CONFIG = {
  max_oracle_age_s: 600,
  payout_window_s: 120, // demo value; production would be ~3600
  challenge_window_s: 60, // demo value; production would be ~86400
  bond_ratio_bps: 10_500,
  penalty_bps: 500,
  default_max_markup_bps: 300,
  default_daily_cap: usdc(1_000),
  max_slashes: 1,
};

const SENDER_USDC = 10_000;
const ANCHOR_USDC = 5_000;
const ANCHOR_BOND = 2_000;
const CORRIDORS = ["MX_SPEI"];

const ANCHORS = [
  { name: "alpha", displayName: "Alpha" },
  { name: "beta", displayName: "Beta" },
  { name: "gamma", displayName: "Gamma" },
] as const;

// Account roles and the .env prefix each one uses.
const ROLES = ["ADMIN", "SPONSOR", "USDC_ISSUER", "DEMO_SENDER", "ALPHA", "BETA", "GAMMA"] as const;
type Role = (typeof ROLES)[number];

// ---------- small helpers ----------

const horizon = new Horizon.Server(HORIZON_URL);
const soroban = new rpc.Server(RPC_URL);

function step(msg: string) {
  console.log(`\n==> ${msg}`);
}

function readExistingEnv(): Record<string, string> {
  if (FRESH || !existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Run the Stellar CLI and return trimmed stdout. Secrets are never printed. */
function stellar(args: string[], opts: { quiet?: boolean } = {}): string {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    STELLAR_RPC_URL: RPC_URL,
    STELLAR_NETWORK_PASSPHRASE: PASSPHRASE,
  };
  delete env.STELLAR_NETWORK;
  try {
    return execFileSync("stellar", args, {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    const shown = args.map((a) => (/^S[A-Z2-7]{55}$/.test(a) ? "S...(secret)" : a)).join(" ");
    if (!opts.quiet) console.error(`\nstellar ${shown}\n${err.stderr || err.stdout || err.message}`);
    throw new Error(`Stellar CLI failed: stellar ${args.slice(0, 2).join(" ")}`);
  }
}

/** Call a contract function, signed and paid for by `source`. */
function invoke(contractId: string, source: Keypair, fn: string, args: Record<string, unknown>) {
  const flat: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    flat.push(`--${k}`, typeof v === "string" ? v : JSON.stringify(v));
  }
  return stellar([
    "contract", "invoke",
    "--id", contractId,
    "--source-account", source.secret(),
    "--", fn, ...flat,
  ]);
}

async function fund(kp: Keypair, label: string) {
  try {
    await horizon.loadAccount(kp.publicKey());
    console.log(`   ${label}: already funded`);
    return;
  } catch {
    // not found: create it with Friendbot
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${TESTNET.friendbotUrl}?addr=${kp.publicKey()}`);
    if (res.ok) {
      console.log(`   ${label}: funded by Friendbot`);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`Friendbot could not fund ${label} (${kp.publicKey()})`);
}

/** Build, sign and submit a classic transaction with one or more operations. */
async function classic(source: Keypair, ops: ReturnType<typeof Operation.payment>[]) {
  const account = await horizon.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: (Number(BASE_FEE) * 100).toString(),
    networkPassphrase: PASSPHRASE,
  });
  for (const op of ops) builder.addOperation(op);
  const tx = builder.setTimeout(120).build();
  tx.sign(source);
  try {
    return await horizon.submitTransaction(tx);
  } catch (e) {
    const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response
      ?.data?.extras?.result_codes;
    throw new Error(`Classic transaction failed: ${JSON.stringify(codes) || (e as Error).message}`);
  }
}

async function usdcBalance(account: string, asset: Asset): Promise<number> {
  const acc = await horizon.loadAccount(account);
  const line = acc.balances.find(
    (b) => "asset_code" in b && b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  );
  return line ? Number(line.balance) : -1; // -1 = no trustline
}

// ---------- main ----------

async function main() {
  const old = readExistingEnv();

  step("Checking tools");
  console.log(`   ${stellar(["--version"]).split("\n")[0]}`);

  if (!SKIP_BUILD) {
    step("Building contracts");
    stellar(["contract", "build"]);
  }
  for (const f of ["raterace.wasm", "mock_oracle.wasm"]) {
    if (!existsSync(resolve(WASM_DIR, f))) throw new Error(`Missing ${f}. Run: stellar contract build`);
  }

  step(FRESH ? "Creating new accounts" : "Loading accounts (reused from .env when present)");
  const keys = {} as Record<Role, Keypair>;
  for (const role of ROLES) {
    const saved = old[`${role}_SECRET`];
    keys[role] = saved ? Keypair.fromSecret(saved) : Keypair.random();
  }
  // Separate ed25519 keys used ONLY to sign quotes.
  const quoteKeys = Object.fromEntries(
    ANCHORS.map((a) => {
      const saved = old[`${a.name.toUpperCase()}_QUOTE_SECRET`];
      return [a.name, saved ? Keypair.fromSecret(saved) : Keypair.random()];
    }),
  ) as Record<(typeof ANCHORS)[number]["name"], Keypair>;

  for (const role of ROLES) await fund(keys[role], role.toLowerCase());

  const deployLedger = (await soroban.getLatestLedger()).sequence;

  step("Test USDC: trustlines and balances");
  const usdcAsset = new Asset("USDC", keys.USDC_ISSUER.publicKey());
  const holders: [Role, number][] = [
    ["DEMO_SENDER", SENDER_USDC],
    ["ALPHA", ANCHOR_USDC],
    ["BETA", ANCHOR_USDC],
    ["GAMMA", ANCHOR_USDC],
  ];
  for (const [role, target] of holders) {
    let bal = await usdcBalance(keys[role].publicKey(), usdcAsset);
    if (bal < 0) {
      await classic(keys[role], [Operation.changeTrust({ asset: usdcAsset })]);
      bal = 0;
    }
    if (bal < target) {
      await classic(keys.USDC_ISSUER, [
        Operation.payment({
          destination: keys[role].publicKey(),
          asset: usdcAsset,
          amount: (target - bal).toFixed(7),
        }),
      ]);
    }
    console.log(`   ${role.toLowerCase()}: ${target.toLocaleString()} USDC`);
  }

  step("Test USDC: Stellar Asset Contract");
  const assetArg = `USDC:${keys.USDC_ISSUER.publicKey()}`;
  let usdcId: string;
  try {
    usdcId = stellar(
      ["contract", "asset", "deploy", "--asset", assetArg, "--source-account", keys.ADMIN.secret()],
      { quiet: true },
    );
  } catch {
    // Already deployed for this issuer: its contract id is deterministic.
    usdcId = stellar(["contract", "id", "asset", "--asset", assetArg]);
  }
  usdcId = usdcId.split("\n").pop()!.trim();
  console.log(`   ${usdcId}`);

  step("Deploying mock oracle");
  // Constructor arguments go after "--": deploying and initialising are one atomic step,
  // so nobody can initialise the contract before we do.
  const oracleId = stellar([
    "contract", "deploy",
    "--wasm", resolve(WASM_DIR, "mock_oracle.wasm"),
    "--source-account", keys.ADMIN.secret(),
    "--", "--admin", keys.ADMIN.publicKey(),
  ]).split("\n").pop()!.trim();
  console.log(`   ${oracleId}`);
  invoke(oracleId, keys.ADMIN, "set_price", { asset: { Other: "MXN" }, price: MXN_PRICE });
  console.log(`   MXN price set to ${Number(MXN_PRICE) / 1e14} USD (${(1e14 / Number(MXN_PRICE)).toFixed(2)} MXN per USD)`);

  step("Deploying RateRace contract");
  const config = { admin: keys.ADMIN.publicKey(), usdc: usdcId, oracle: oracleId, ...CONFIG };
  const rateraceId = stellar([
    "contract", "deploy",
    "--wasm", resolve(WASM_DIR, "raterace.wasm"),
    "--source-account", keys.ADMIN.secret(),
    "--", "--config", JSON.stringify(config),
  ]).split("\n").pop()!.trim();
  console.log(`   ${rateraceId}`);
  console.log("   deployed and initialised in one transaction");

  step("Anchors: register, bond, activate");
  for (const a of ANCHORS) {
    const kp = keys[a.name.toUpperCase() as Role];
    const signingKeyHex = Buffer.from(quoteKeys[a.name].rawPublicKey()).toString("hex");
    invoke(rateraceId, kp, "register_anchor", {
      anchor: kp.publicKey(),
      signing_key: signingKeyHex,
      corridors: CORRIDORS,
    });
    invoke(rateraceId, kp, "add_bond", { anchor: kp.publicKey(), amount: usdc(ANCHOR_BOND) });
    invoke(rateraceId, keys.ADMIN, "set_active", { anchor: kp.publicKey(), active: true });
    console.log(`   ${a.name}: bonded ${ANCHOR_BOND.toLocaleString()} USDC, active`);
  }

  step("Verifying on-chain state");
  const anchorIds = JSON.parse(invoke(rateraceId, keys.ADMIN, "list_anchor_ids", {})) as string[];
  if (anchorIds.length !== ANCHORS.length) throw new Error(`Expected 3 anchors, found ${anchorIds.length}`);
  const alphaState = JSON.parse(
    invoke(rateraceId, keys.ADMIN, "get_anchor", { anchor: keys.ALPHA.publicKey() }),
  ) as { active: boolean; bond: string };
  if (!alphaState.active || BigInt(alphaState.bond) !== BigInt(usdc(ANCHOR_BOND))) {
    throw new Error(`Alpha state is wrong: ${JSON.stringify(alphaState)}`);
  }
  console.log(`   3 anchors registered; alpha bond = ${Number(BigInt(alphaState.bond) / UNIT)} USDC, active`);

  step("Writing .env and deployments/testnet.json");
  const anchorUrls = ANCHORS.map((a) => `${a.name}=http://localhost:${PORTS[a.name]}`).join(",");
  const envLines = [
    "# Generated by scripts/deploy.ts. NEVER COMMIT THIS FILE. Share it privately with the team.",
    "STELLAR_NETWORK=testnet",
    `RPC_URL=${RPC_URL}`,
    `HORIZON_URL=${HORIZON_URL}`,
    `NETWORK_PASSPHRASE=${PASSPHRASE}`,
    `EXPLORER_URL=${TESTNET.explorerUrl}`,
    "",
    `RATERACE_CONTRACT_ID=${rateraceId}`,
    `ORACLE_CONTRACT_ID=${oracleId}`,
    `USDC_CONTRACT_ID=${usdcId}`,
    "USDC_CODE=USDC",
    `USDC_ISSUER_PUBLIC=${keys.USDC_ISSUER.publicKey()}`,
    `USDC_ISSUER_SECRET=${keys.USDC_ISSUER.secret()}`,
    `DEPLOY_LEDGER=${deployLedger}`,
    "",
    `ADMIN_PUBLIC=${keys.ADMIN.publicKey()}`,
    `ADMIN_SECRET=${keys.ADMIN.secret()}`,
    `SPONSOR_PUBLIC=${keys.SPONSOR.publicKey()}`,
    `SPONSOR_SECRET=${keys.SPONSOR.secret()}`,
    `DEMO_SENDER_PUBLIC=${keys.DEMO_SENDER.publicKey()}`,
    `DEMO_SENDER_SECRET=${keys.DEMO_SENDER.secret()}`,
    "",
    ...ANCHORS.flatMap((a) => {
      const p = a.name.toUpperCase();
      const kp = keys[p as Role];
      return [
        `${p}_PUBLIC=${kp.publicKey()}`,
        `${p}_SECRET=${kp.secret()}`,
        `${p}_QUOTE_SECRET=${quoteKeys[a.name].secret()}`,
      ];
    }),
    "",
    `MOCK_MXN_USD_PRICE=${MXN_PRICE}`,
    "",
    `ROUTER_URL=http://localhost:${PORTS.router}`,
    `INDEXER_URL=http://localhost:${PORTS.indexer}`,
    `ANCHOR_URLS=${anchorUrls}`,
    "",
    "# Web app (public values only)",
    `VITE_RPC_URL=${RPC_URL}`,
    `VITE_NETWORK_PASSPHRASE=${PASSPHRASE}`,
    `VITE_RATERACE_CONTRACT_ID=${rateraceId}`,
    `VITE_ROUTER_URL=http://localhost:${PORTS.router}`,
    `VITE_INDEXER_URL=http://localhost:${PORTS.indexer}`,
    `VITE_EXPLORER_URL=${TESTNET.explorerUrl}`,
    "",
  ];
  writeFileSync(ENV_PATH, envLines.join("\n"), { mode: 0o600 });

  const deployment: Deployment = {
    network: "testnet",
    deployedAt: new Date().toISOString(),
    deployLedger,
    contracts: { raterace: rateraceId, oracle: oracleId, usdc: usdcId },
    usdc: { code: "USDC", issuer: keys.USDC_ISSUER.publicKey() },
    accounts: {
      admin: keys.ADMIN.publicKey(),
      sponsor: keys.SPONSOR.publicKey(),
      demoSender: keys.DEMO_SENDER.publicKey(),
    },
    anchors: ANCHORS.map((a) => ({
      name: a.name,
      displayName: a.displayName,
      address: keys[a.name.toUpperCase() as Role].publicKey(),
      signingKeyHex: Buffer.from(quoteKeys[a.name].rawPublicKey()).toString("hex"),
      quoteUrl: `http://localhost:${PORTS[a.name]}`,
    })),
  };
  mkdirSync(resolve(REPO_ROOT, "deployments"), { recursive: true });
  writeFileSync(
    resolve(REPO_ROOT, "deployments/testnet.json"),
    JSON.stringify(deployment, null, 2) + "\n",
  );

  console.log("\nDeployed to Stellar testnet.\n");
  console.log(`RateRace contract  ${rateraceId}\n                   ${explorerContract(rateraceId)}`);
  console.log(`Mock oracle        ${oracleId}\n                   ${explorerContract(oracleId)}`);
  console.log(`Test USDC (SAC)    ${usdcId}\n                   ${explorerContract(usdcId)}`);
  console.log(`Admin              ${explorerAccount(keys.ADMIN.publicKey())}`);
  console.log("\n.env written (secret, not committed). deployments/testnet.json written (public, commit it).");
}

main().catch((e) => {
  console.error(`\nDeploy failed: ${(e as Error).message}`);
  process.exit(1);
});

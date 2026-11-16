// Demo wallet. Owner: Abhiraj (#17).
//
// On first visit the browser makes a TESTNET keypair and keeps it in localStorage. The user
// never sees it: to them this is just "your account". Every transaction they sign is paid
// for by the router's sponsor key (fee bump), so the account only needs:
//   1. to exist          -> /onboard/fund (Friendbot)
//   2. a USDC trustline  -> changeTrust signed here, sent through /submit
//   3. test dollars      -> /onboard/usdc
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { AMOUNT_DECIMALS, TESTNET, toUnits } from "@raterace/shared";
import { api } from "./api";
import { chainlog } from "./chainlog";
import { config } from "./config";

const SECRET_KEY = "raterace_demo_secret";
const horizon = new Horizon.Server(TESTNET.horizonUrl);

let memoryKeypair: Keypair | null = null;

/** The demo keypair. Survives reloads when storage works; otherwise lives for this tab only. */
export function demoKeypair(): Keypair {
  if (memoryKeypair) return memoryKeypair;
  try {
    const saved = localStorage.getItem(SECRET_KEY);
    if (saved) return (memoryKeypair = Keypair.fromSecret(saved));
  } catch {
    // Private mode or blocked storage: fall through to a fresh key.
  }
  memoryKeypair = Keypair.random();
  try {
    localStorage.setItem(SECRET_KEY, memoryKeypair.secret());
  } catch {
    // Not fatal: the key just won't survive a reload.
  }
  return memoryKeypair;
}

async function loadAccount(publicKey: string) {
  try {
    return await horizon.loadAccount(publicKey);
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) return null;
    throw e;
  }
}

function usdcBalance(account: Horizon.AccountResponse, code: string, issuer: string): bigint | null {
  const line = account.balances.find(
    (b) => "asset_code" in b && b.asset_code === code && b.asset_issuer === issuer,
  );
  return line ? toUnits(line.balance, AMOUNT_DECIMALS) : null;
}

/**
 * Makes sure the demo account can send `sendUsdcUnits`. Safe to call every time: each step
 * is skipped when it is already done. `onStep` gets short, non-technical progress text.
 */
export async function ensureReady(sendUsdcUnits: bigint, onStep?: (text: string) => void): Promise<Keypair> {
  const kp = demoKeypair();
  const pk = kp.publicKey();
  const { usdc } = await api.health();

  let account = await loadAccount(pk);
  if (!account) {
    onStep?.("Setting up your account…");
    const id = chainlog.start("Creating your account on Stellar", `${pk.slice(0, 6)}…${pk.slice(-4)} · key made in this browser`);
    try {
      const r = await api.fund(pk);
      account = await loadAccount(pk);
      if (!account) throw new Error("Account setup did not finish. Please try again.");
      chainlog.done(id, { title: "Account created on Stellar testnet", hash: r.hash });
    } catch (e) {
      chainlog.fail(id);
      throw e;
    }
  }

  let balance = usdcBalance(account, usdc.code, usdc.issuer);
  if (balance === null) {
    onStep?.("Setting up your account…");
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
      .addOperation(Operation.changeTrust({ asset: new Asset(usdc.code, usdc.issuer) }))
      .setTimeout(60)
      .build();
    tx.sign(kp);
    const id = chainlog.start("Enabling digital dollars (USDC)", "you sign · RateRace pays the network fee");
    const res = await api.submit(tx.toXDR()).catch((e) => {
      chainlog.fail(id);
      throw e;
    });
    if (res.status !== "SUCCESS") {
      chainlog.fail(id);
      throw new Error("Account setup did not finish. Please try again.");
    }
    chainlog.done(id, { title: "USDC enabled · fee sponsored", hash: res.hash, sponsored: true });
    balance = 0n;
  }

  if (balance < sendUsdcUnits) {
    onStep?.("Adding demo dollars to your account…");
    const id = chainlog.start("Adding 1,000 test dollars");
    try {
      const r = await api.usdc(pk);
      chainlog.done(id, { title: "1,000 test USDC received", detail: "demo money from the test issuer", hash: r.hash });
    } catch (e) {
      chainlog.fail(id);
      throw e;
    }
  }
  return kp;
}

let usdcAsset: { code: string; issuer: string } | null = null;

/** The demo account's USDC balance (USDC units), or 0 if the account doesn't exist yet. */
export async function usdcBalanceUnits(): Promise<bigint> {
  usdcAsset ??= (await api.health()).usdc;
  const account = await loadAccount(demoKeypair().publicKey());
  if (!account) return 0n;
  return usdcBalance(account, usdcAsset.code, usdcAsset.issuer) ?? 0n;
}

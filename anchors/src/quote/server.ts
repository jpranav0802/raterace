// Mock anchor quote servers. Owner: Pranav (issue #12). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
//
// Each anchor exposes a SEP-38-shaped `POST /quote` with a RateRace extension: a firm,
// signed quote for the exact amount the recipient receives after all fees. A real anchor
// plugs in by serving the same endpoint.
import cors from "cors";
import express from "express";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  CORRIDOR_IDS,
  PORTS,
  corridorById,
  scaleFee,
  bytesToHex,
  fromUnits,
  landedLocal,
  localPerUsd,
  toUnits,
  type AnchorInfo,
  type QuoteJson,
} from "@raterace/shared";
import { makeClients, oraclePrice, quoteDigest, toContractQuote } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, optionalEnv } from "@raterace/shared/node";
import { PROFILES, type AnchorProfile } from "./config";
import { renderStellarToml } from "./stellarToml";

const MAX_QUOTE_LIFETIME_S = 300;
/**
 * Demo "live market" mode (added by Abhiraj on the demo branch): the router asks this test
 * anchor to stand in for a REAL provider and quote that provider's live public price
 * (Wise comparison data). The anchor still signs, still needs free bond, and the contract
 * still checks the price against the oracle. Turn off with ANCHOR_STAND_IN=0.
 */
const STAND_IN = optionalEnv("ANCHOR_STAND_IN", "1") !== "0";

interface StandIn {
  provider: string;
  landed_local: string;
  fee_local: string;
  spread_bps: number;
}
const BPS = 10_000n;

/** This anchor's public base URL: ANCHOR_URLS in .env, else deployments/testnet.json, else localhost. */
function publicUrl(name: AnchorProfile["name"], fromDeployment?: string): string {
  for (const pair of optionalEnv("ANCHOR_URLS").split(",")) {
    const [k, v] = pair.split("=");
    if (k?.trim() === name && v) return v.trim();
  }
  return fromDeployment || `http://localhost:${PORTS[name]}`;
}

class QuoteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function startAnchor(profile: AnchorProfile) {
  const cfg = loadConfig();
  const prefix = profile.name.toUpperCase();
  const address = optionalEnv(`${prefix}_PUBLIC`);
  const quoteSecret = optionalEnv(`${prefix}_QUOTE_SECRET`);
  const usdcIssuer = optionalEnv("USDC_ISSUER_PUBLIC");
  const deployed = Boolean(address && quoteSecret && cfg.rateraceContractId && cfg.oracleContractId);

  const quoteKey = deployed ? Keypair.fromSecret(quoteSecret) : null;
  const clients = deployed
    ? makeClients({
        rpcUrl: cfg.rpcUrl,
        networkPassphrase: cfg.networkPassphrase,
        rateraceContractId: cfg.rateraceContractId,
        oracleContractId: cfg.oracleContractId,
        simulationAccount: address,
      })
    : null;

  const info: AnchorInfo = {
    name: profile.name,
    displayName: profile.displayName,
    address,
    signingKeyHex: quoteKey ? bytesToHex(quoteKey.rawPublicKey()) : "",
    corridors: CORRIDOR_IDS,
    spreadBps: profile.spreadBps,
    payoutFeeLocal: profile.payoutFeeLocal.toString(),
  };

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "anchor", name: profile.name, deployed });
  });

  app.get("/info", (_req, res) => {
    res.json(info);
  });

  // ---- SEP-1: how wallets and services discover an anchor ----
  // .env values first; without a .env, the public deployments/testnet.json still works.
  const deployment = loadDeployment();
  const listed = deployment?.anchors.find((a) => a.name === profile.name);
  const stellarToml = renderStellarToml({
    displayName: profile.displayName,
    networkPassphrase: cfg.networkPassphrase,
    account: address || listed?.address,
    signingKey: quoteKey
      ? quoteKey.publicKey()
      : listed?.signingKeyHex
        ? StrKey.encodeEd25519PublicKey(Buffer.from(listed.signingKeyHex, "hex"))
        : undefined,
    quoteServer: publicUrl(profile.name, listed?.quoteUrl),
    usdcIssuer: usdcIssuer || deployment?.usdc.issuer,
  });
  app.get("/.well-known/stellar.toml", (_req, res) => {
    // SEP-1 requires CORS (set for every route by cors() above) and a plain-text body.
    res.type("text/plain").send(stellarToml);
  });

  app.post("/quote", async (req, res) => {
    try {
      if (!clients || !quoteKey) {
        throw new QuoteError(503, 'Not configured: no .env. Run "npm run deploy" first.');
      }
      const body = req.body ?? {};
      const ext = body.raterace ?? {};

      // ---- validate the request ----
      if (body.sell_asset !== `stellar:USDC:${usdcIssuer}`) {
        throw new QuoteError(400, "sell_asset must be this network's USDC");
      }
      const corridor = typeof ext.corridor === "string" ? corridorById(ext.corridor) : undefined;
      if (!corridor) throw new QuoteError(400, "Unsupported corridor");
      const assetCode = corridor.currency;
      if (body.buy_asset !== `iso4217:${assetCode}`) {
        throw new QuoteError(400, `buy_asset must be iso4217:${assetCode} for ${corridor.id}`);
      }
      if (typeof ext.request_id !== "string" || !/^[0-9a-f]{64}$/.test(ext.request_id)) {
        throw new QuoteError(400, "raterace.request_id must be 64 lowercase hex characters");
      }
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = Number(ext.expires_at);
      if (!Number.isInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_QUOTE_LIFETIME_S) {
        throw new QuoteError(400, "raterace.expires_at must be within the next 5 minutes");
      }
      let sendUsdc: bigint;
      try {
        sendUsdc = toUnits(String(body.sell_amount));
      } catch {
        throw new QuoteError(400, "sell_amount must be a decimal number, e.g. 200.00");
      }
      if (sendUsdc <= 0n) throw new QuoteError(400, "sell_amount must be positive");

      // ---- on-chain checks: am I allowed to quote, and what is the market rate? ----
      const [anchorTx, configTx, price] = await Promise.all([
        clients.raterace.get_anchor({ anchor: address }),
        clients.raterace.get_config(),
        oraclePrice(clients.oracle, assetCode),
      ]);
      const me = anchorTx.result.unwrap();
      const chainConfig = configTx.result.unwrap();
      if (!me.active) throw new QuoteError(503, "Anchor is suspended");
      // The contract refuses a corridor this anchor isn't registered for; don't sign one.
      if (!me.corridors.map(String).includes(corridor.id)) {
        throw new QuoteError(400, "This anchor is not registered for that corridor");
      }
      const reserve = (sendUsdc * BigInt(chainConfig.bond_ratio_bps)) / BPS;
      if (BigInt(me.bond) - BigInt(me.reserved) < reserve) {
        throw new QuoteError(503, "Not enough free bond for this amount");
      }
      if (!price) throw new QuoteError(503, "No market rate available");

      // ---- price it ----
      const standIn = ext.stand_in as StandIn | undefined;
      if (standIn && !STAND_IN) throw new QuoteError(400, "Stand-in quotes are turned off");
      let landed: bigint;
      // The profile's fee is defined in pesos; scale it to a similar value in this currency.
      const payoutFee = scaleFee(profile.payoutFeeLocal, assetCode);
      let fees = { spreadBps: profile.spreadBps, payoutFeeLocal: payoutFee.toString() };
      if (standIn) {
        if (typeof standIn.landed_local !== "string" || !/^\d+$/.test(standIn.landed_local)) {
          throw new QuoteError(400, "stand_in.landed_local must be an integer string");
        }
        landed = BigInt(standIn.landed_local);
        // Never sign something absurd: at most 5% above the market amount.
        const market = (sendUsdc * 10n ** 14n) / price.price;
        if (landed > (market * 105n) / 100n) throw new QuoteError(400, "stand_in price is not plausible");
        fees = { spreadBps: Math.max(0, Math.round(Number(standIn.spread_bps) || 0)), payoutFeeLocal: String(standIn.fee_local ?? "0") };
      } else {
        landed = landedLocal(sendUsdc, price.price, profile.spreadBps, payoutFee);
      }
      if (landed <= 0n) throw new QuoteError(400, "Amount too small to cover the payout fee");

      const unsigned: Omit<QuoteJson, "signature"> = {
        anchor: address,
        anchorName: profile.name,
        displayName: standIn ? String(standIn.provider) : profile.displayName,
        requestId: ext.request_id,
        corridor: corridor.id,
        assetCode,
        sendUsdc: sendUsdc.toString(),
        landedLocal: landed.toString(),
        expiresAt,
        fees,
      };

      // ---- sign exactly what the contract will verify ----
      const digest = await quoteDigest(clients.raterace, toContractQuote(unsigned));
      const signature = bytesToHex(quoteKey.sign(digest));

      const fee = fromUnits(payoutFee);
      res.json({
        // SEP-38 firm quote fields
        id: ext.request_id,
        expires_at: new Date(expiresAt * 1000).toISOString(),
        price: (1 / localPerUsd(price.price) / (1 - profile.spreadBps / 10_000)).toFixed(7),
        sell_asset: body.sell_asset,
        sell_amount: fromUnits(sendUsdc),
        buy_asset: body.buy_asset,
        buy_amount: fromUnits(landed),
        fee: {
          total: fee,
          asset: body.buy_asset,
          details: [{ name: `${corridor.method} payout fee`, amount: fee }],
        },
        // RateRace extension: the signed, all-in landed amount
        raterace: { quote: unsigned, signature },
      });
    } catch (e) {
      if (e instanceof QuoteError) {
        res.status(e.status).json({ error: e.message });
      } else {
        console.error(`[${profile.name}] quote failed:`, (e as Error).message);
        res.status(502).json({ error: "Could not reach the Stellar network. Try again." });
      }
    }
  });

  const port = PORTS[profile.name];
  app.listen(port, () =>
    console.log(
      `anchor ${profile.name} listening on http://localhost:${port}` +
        (deployed ? "" : "  (no .env yet: /quote returns 503)"),
    ),
  );
}

export function startQuoteServers() {
  for (const profile of PROFILES) startAnchor(profile);
}

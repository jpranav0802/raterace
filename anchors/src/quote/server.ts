// Mock anchor quote servers. Owner: Pranav (issue #12). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
//
// Each anchor exposes a SEP-38-shaped `POST /quote` with a RateRace extension: a firm,
// signed quote for the exact amount the recipient receives after all fees. A real anchor
// plugs in by serving the same endpoint.
import cors from "cors";
import express from "express";
import { Keypair } from "@stellar/stellar-sdk";
import {
  ASSET_MXN,
  CORRIDOR_MX_SPEI,
  PORTS,
  bytesToHex,
  fromUnits,
  landedLocal,
  localPerUsd,
  toUnits,
  type AnchorInfo,
  type QuoteJson,
} from "@raterace/shared";
import { makeClients, oraclePrice, quoteDigest, toContractQuote } from "@raterace/shared/chain";
import { loadConfig, optionalEnv } from "@raterace/shared/node";
import { PROFILES, type AnchorProfile } from "./config";

const MAX_QUOTE_LIFETIME_S = 300;
const BPS = 10_000n;

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
    corridors: [CORRIDOR_MX_SPEI],
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
      if (body.buy_asset !== `iso4217:${ASSET_MXN}`) {
        throw new QuoteError(400, "buy_asset must be iso4217:MXN");
      }
      if (ext.corridor !== CORRIDOR_MX_SPEI) {
        throw new QuoteError(400, "Unsupported corridor");
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
        oraclePrice(clients.oracle, ASSET_MXN),
      ]);
      const me = anchorTx.result.unwrap();
      const chainConfig = configTx.result.unwrap();
      if (!me.active) throw new QuoteError(503, "Anchor is suspended");
      const reserve = (sendUsdc * BigInt(chainConfig.bond_ratio_bps)) / BPS;
      if (BigInt(me.bond) - BigInt(me.reserved) < reserve) {
        throw new QuoteError(503, "Not enough free bond for this amount");
      }
      if (!price) throw new QuoteError(503, "No market rate available");

      // ---- price it ----
      const landed = landedLocal(sendUsdc, price.price, profile.spreadBps, profile.payoutFeeLocal);
      if (landed <= 0n) throw new QuoteError(400, "Amount too small to cover the payout fee");

      const unsigned: Omit<QuoteJson, "signature"> = {
        anchor: address,
        anchorName: profile.name,
        displayName: profile.displayName,
        requestId: ext.request_id,
        corridor: CORRIDOR_MX_SPEI,
        assetCode: ASSET_MXN,
        sendUsdc: sendUsdc.toString(),
        landedLocal: landed.toString(),
        expiresAt,
        fees: { spreadBps: profile.spreadBps, payoutFeeLocal: profile.payoutFeeLocal.toString() },
      };

      // ---- sign exactly what the contract will verify ----
      const digest = await quoteDigest(clients.raterace, toContractQuote(unsigned));
      const signature = bytesToHex(quoteKey.sign(digest));

      const fee = fromUnits(profile.payoutFeeLocal);
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
          details: [{ name: "SPEI payout fee", amount: fee }],
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

# Reflector check (issue #4)

Checked 15 Nov 2026 by calling the contracts directly over Stellar RPC (simulated reads).

## (a) Is there a testnet fiat feed with MXN?

**Listed, but not live.** Reflector's testnet fiat contract
`CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W` reports `decimals = 14`,
`resolution = 300` and lists `EUR, GBP, CHF, CAD, MXN, ARS, BRL, THB, XAU`, but
`lastprice(Other("MXN"))` returns `None` (no live MXN price). Only EUR was updating
(last at 2026-11-15T21:50:00Z). Reflector feeds stay live only while someone pays for
them, so testnet MXN is effectively unavailable.

The tutorial-era testnet address `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63`
now serves crypto prices only (BTC, ETH, USDC, ...), no fiat.

**Decision:** use our `mock_oracle` on testnet. It has the same interface, so switching to
real Reflector later is a one-address change.

Mainnet fiat feed `CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC` is live:
24 assets including MXN, BRL, NGN, KES, ARS, PHP, ZAR, COP; MXN `lastprice` on
14 Nov 2026 was `5382749268572` (0.0538 USD per MXN, about 18.58 MXN per USD).
Use this as the named source when updating `MOCK_MXN_USD_PRICE` before the video.

## (b) `timestamp` unit

**Seconds.** Example: testnet EUR `timestamp = 1794779400` = 2026-11-15T21:50:00Z;
mainnet values look the same. This matches our mock and `env.ledger().timestamp()`, so no
conversion is needed if we switch to real Reflector.

## (c) `lastprice` signature and `Asset` shape

`lastprice(asset: Asset) -> Option<PriceData>`, with
`enum Asset { Stellar(Address), Other(Symbol) }` and
`struct PriceData { price: i128, timestamp: u64 }`. Fiat uses `Asset::Other(Symbol("MXN"))`
(on the wire: `Vec[Symbol("Other"), Symbol("MXN")]`). Price is USD per 1 unit with
`decimals()` = 14. This matches `contracts/oracle_interface` exactly.

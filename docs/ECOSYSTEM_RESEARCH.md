# Has anyone on Stellar built this already?

Checked 15 Nov 2026 with the LumenLoop ecosystem MCP server (`https://mcp.lumenloop.com`), the
public index of Stellar projects and Stellar Community Fund (SCF) submissions that also feeds
Stellar's Raven MCP server.

## What we searched

1. **SCF submissions, by meaning** (`find_similar_scf_submissions`): "Remittance auction where
   multiple anchors bid signed quotes for the amount the recipient receives; best quote wins;
   smart contract escrow pays the anchor after payout and slashes its bond on failure."
2. **Project directory, by meaning** (`search_directory`): "remittance quote aggregator anchors".

## What came back

The closest SCF submissions (similarity 0.43 to 0.47, where 1.0 is identical):

| Submission | Round | What it is | How RateRace differs |
|---|---|---|---|
| Bridge+Anchor XOF/USDC for lomi. | SCF #45 | One anchor for one corridor | We make many anchors compete per transfer |
| CashAbroad | SCF #14 | Remittance and B2B payments platform | A single provider, not a market between providers |
| Pay Globally With USDC | SCF #34 | Send in local currency, receive in local currency | A single app's rate, no competing quotes |
| RFQ for RWA instant redemptions (Octarine) | SCF #44 | Request-for-quote, but for redeeming real-world-asset tokens | Same mechanism family, different market: not remittances, not anchors |
| Soroswap.Finance | Liquidity Award 2024 Q1 | Exchange and aggregator across on-chain liquidity pools | Aggregates pools; we aggregate licensed payout anchors and price the cash-out |
| Anclap | SCF #7 | Anchor plus debit card | An anchor: a supplier in our auction, not a competitor |

The closest directory projects were remittance apps and anchor-access platforms: Puenta,
Outbounder, RemittEase, DomiPago, Yolat.

## What this does and does not show

- **It shows:** these two searches surfaced no project that runs a per-transfer auction between
  Stellar anchors on the landed amount, with escrow and a slashable bond.
- **It does not show** that no such project exists. The index covers public projects and SCF
  submissions only, and we ran two queries.
- The nearest mechanism is Octarine's request-for-quote for asset redemptions. If a judge asks
  "isn't this just RFQ?", the honest answer is: yes, the mechanism is RFQ; what is new is applying
  it to anchor payouts, pricing the amount that lands after all fees, and backing it with bonds.

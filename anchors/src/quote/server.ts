// Mock anchor quote servers. Owner: Pranav (issue #12). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
// TODO #12: POST /quote (SEP-38 shape + signed RateRace quote), GET /info
import cors from "cors";
import express from "express";
import { ANCHOR_NAMES, PORTS } from "@raterace/shared";

export function startQuoteServers() {
  for (const name of ANCHOR_NAMES) {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "50kb" }));

    app.get("/health", (_req, res) => {
      res.json({ ok: true, service: "anchor", name });
    });

    const port = PORTS[name];
    app.listen(port, () => console.log(`anchor ${name} listening on http://localhost:${port}`));
  }
}

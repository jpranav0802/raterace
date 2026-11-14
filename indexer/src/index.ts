// Event indexer. Owner: Avani (issue #16). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
// TODO #16: poll RPC getEvents; GET /orders/:id, GET /orders?sender=, GET /leaderboard
import cors from "cors";
import express from "express";
import { PORTS } from "@raterace/shared";

const app = express();
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "indexer" });
});

const port = Number(process.env.PORT) || PORTS.indexer;
app.listen(port, () => console.log(`indexer listening on http://localhost:${port}`));

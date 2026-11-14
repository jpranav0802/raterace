// Quote router. Owner: Abhiraj (issues #13, #14). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
// TODO #13: POST /rfq, GET /anchors   TODO #14: POST /submit, POST /onboard/fund, POST /onboard/usdc
import cors from "cors";
import express from "express";
import { PORTS } from "@raterace/shared";

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "router" });
});

const port = Number(process.env.PORT) || PORTS.router;
app.listen(port, () => console.log(`router listening on http://localhost:${port}`));

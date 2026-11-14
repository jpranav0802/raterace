// Starts the three mock anchors (quote servers) and, later, the payout workers.
import { startQuoteServers } from "./quote/server";
import { startPayoutWorkers } from "./payout/worker";

startQuoteServers();
startPayoutWorkers();

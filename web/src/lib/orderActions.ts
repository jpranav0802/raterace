// What the sender can do to an order after it is locked (issue #19).
// Each action is signed by the demo wallet and sent through the router, which pays the fee.
import { contract, rpc } from "@stellar/stellar-sdk";
import { RateRaceClient } from "@raterace/shared/chain";
import { api } from "./api";
import { config } from "./config";
import { errorMessage } from "./format";
import { demoKeypair } from "./wallet";

export type OrderAction = "confirm" | "dispute" | "refund_expired";

function contractErrorCode(text: string): number | undefined {
  const m = text.match(/Error\(Contract, #(\d+)\)/);
  return m ? Number(m[1]) : undefined;
}

/** Runs the action on-chain and returns the transaction hash. Throws a readable Error. */
export async function runOrderAction(action: OrderAction, orderId: number): Promise<string> {
  const kp = demoKeypair();
  const client = new RateRaceClient({
    contractId: config.rateraceContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: kp.publicKey(),
    signTransaction: contract.basicNodeSigner(kp, config.networkPassphrase).signTransaction,
  });

  const tx = await client[action]({ order_id: BigInt(orderId) });
  // The contract runs once in simulation first, so most problems show up before signing.
  if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) {
    throw new Error(errorMessage(contractErrorCode(tx.simulation.error)));
  }
  await tx.sign();
  if (!tx.signed) throw new Error(errorMessage());

  const res = await api.submit(tx.signed.toXDR());
  if (res.status !== "SUCCESS") throw new Error(errorMessage(res.errorCode));
  return res.hash;
}

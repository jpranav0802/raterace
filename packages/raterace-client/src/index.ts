import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;





export interface Order {
  /**
 * 0 until `mark_paid`.
 */
challenge_ends: u64;
  id: u64;
  opened_at: u64;
  payout_deadline: u64;
  /**
 * sha256 of the anchor's payout receipt.
 */
payout_ref: Option<Buffer>;
  quote: Quote;
  /**
 * sha256 of the recipient details. Never raw personal data.
 */
recipient_hash: Buffer;
  reserved_bond: i128;
  sender: string;
  status: Status;
}


export interface Quote {
  anchor: string;
  /**
 * Local currency code for the oracle lookup, e.g. MXN.
 */
asset_code: string;
  corridor: string;
  expires_at: u64;
  /**
 * What the recipient receives AFTER all fees, in local currency (7 decimals).
 */
landed_local: i128;
  /**
 * Single use (replay protection).
 */
request_id: Buffer;
  send_usdc: i128;
}


export interface Anchor {
  active: boolean;
  /**
 * Total USDC bonded.
 */
bond: i128;
  /**
 * Corridors this anchor may serve, e.g. MX_SPEI.
 */
corridors: Array<string>;
  disputed: u32;
  filled: u32;
  /**
 * Part of the bond locked by unfinished orders.
 */
reserved: i128;
  /**
 * ed25519 public key used ONLY to sign quotes.
 */
signing_key: Buffer;
  slashed: u32;
}


export interface Config {
  admin: string;
  /**
 * Bond reserved per order, in bps of send_usdc (10500 = 105%). Must be >= 10000 + penalty_bps.
 */
bond_ratio_bps: u32;
  /**
 * Time the sender has to dispute after `mark_paid` (demo 60).
 */
challenge_window_s: u64;
  /**
 * Daily sending cap for senders with no explicit limit.
 */
default_daily_cap: i128;
  /**
 * Hard cap on markup vs the oracle rate (300 = 3%).
 */
default_max_markup_bps: u32;
  /**
 * Reject oracle prices older than this (e.g. 600).
 */
max_oracle_age_s: u64;
  /**
 * Anchor is auto-suspended when its slashed count reaches this (1 = after one slash).
 */
max_slashes: u32;
  /**
 * Reflector-compatible oracle (our mock on testnet).
 */
oracle: string;
  /**
 * Time the anchor has to pay out after `open_order` (demo 120).
 */
payout_window_s: u64;
  /**
 * Penalty paid to the sender from the bond when the anchor fails (500 = 5%).
 */
penalty_bps: u32;
  /**
 * USDC Stellar Asset Contract.
 */
usdc: string;
}

export type Status = {tag: "Open", values: void} | {tag: "Paid", values: void} | {tag: "Disputed", values: void} | {tag: "Settled", values: void} | {tag: "Refunded", values: void} | {tag: "Slashed", values: void};


export interface SenderLimit {
  daily_cap: i128;
  tier: u32;
}

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidConfig"},
  4: {message:"InvalidAmount"},
  5: {message:"Overflow"},
  10: {message:"AnchorExists"},
  11: {message:"AnchorNotFound"},
  12: {message:"AnchorInactive"},
  13: {message:"CorridorNotAllowed"},
  14: {message:"InsufficientBond"},
  15: {message:"NotOrderAnchor"},
  20: {message:"QuoteExpired"},
  21: {message:"RequestIdUsed"},
  22: {message:"OracleUnavailable"},
  23: {message:"OracleStale"},
  24: {message:"MarkupTooHigh"},
  25: {message:"DailyCapExceeded"},
  30: {message:"OrderNotFound"},
  31: {message:"WrongStatus"},
  32: {message:"DeadlinePassed"},
  33: {message:"DeadlineNotPassed"},
  34: {message:"ChallengeWindowOpen"},
  35: {message:"ChallengeWindowClosed"}
}











export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. Auth: `config.admin`.
   */
  init: ({config}: {config: Config}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a confirm transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sender confirms the money arrived; releases the bond. Auth: order sender.
   */
  confirm: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a dispute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sender reports a problem within the challenge window. Auth: order sender.
   */
  dispute: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Anyone: release the bond once the challenge window has passed.
   */
  release: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin decides a dispute. At fault: sender repaid + penalty from the bond.
   */
  resolve: ({order_id, anchor_at_fault}: {order_id: u64, anchor_at_fault: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a add_bond transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Deposit USDC into the anchor's bond. Auth: `anchor`.
   */
  add_bond: ({anchor, amount}: {anchor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_order: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Order>>>

  /**
   * Construct and simulate a mark_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Anchor reports the payout and receives the escrowed USDC. Auth: `anchor`.
   */
  mark_paid: ({anchor, order_id, payout_ref}: {anchor: string, order_id: u64, payout_ref: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_anchor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_anchor: ({anchor}: {anchor: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Anchor>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Config>>>

  /**
   * Construct and simulate a open_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Accept a signed quote: verify it, check markup vs the oracle, escrow the
   * sender's USDC and reserve the anchor's bond. Returns the order id. Auth: `sender`.
   */
  open_order: ({sender, quote, signature, recipient_hash, max_markup_bps}: {sender: string, quote: Quote, signature: Buffer, recipient_hash: Buffer, max_markup_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a set_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Approve or suspend an anchor. Auth: admin.
   */
  set_active: ({anchor, active}: {anchor: string, active: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a quote_digest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * sha256 of the quote's XDR. Anchors sign exactly these 32 bytes.
   * Off-chain code gets them by simulating this function (never re-encode in JS).
   */
  quote_digest: ({quote}: {quote: Quote}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a update_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace the config (e.g. demo time windows). Auth: current admin.
   */
  update_config: ({config}: {config: Config}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a withdraw_bond transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw unreserved bond. Auth: `anchor`.
   */
  withdraw_bond: ({anchor, amount}: {anchor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund_expired transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Anyone: after a missed payout deadline, refund the sender + penalty from the bond.
   */
  refund_expired: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a list_anchor_ids transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_anchor_ids: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a register_anchor transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register as an anchor (inactive until the admin approves). Auth: `anchor`.
   */
  register_anchor: ({anchor, signing_key, corridors}: {anchor: string, signing_key: Buffer, corridors: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_sender_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_sender_limit: ({sender}: {sender: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<SenderLimit>>>

  /**
   * Construct and simulate a set_sender_limit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Set a sender's tier and daily cap (stand-in for KYC tiers). Auth: admin.
   */
  set_sender_limit: ({sender, tier, daily_cap}: {sender: string, tier: u32, daily_cap: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAACVPbmUtdGltZSBzZXR1cC4gQXV0aDogYGNvbmZpZy5hZG1pbmAuAAAAAAAABGluaXQAAAABAAAAAAAAAAZjb25maWcAAAAAB9AAAAAGQ29uZmlnAAAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAElTZW5kZXIgY29uZmlybXMgdGhlIG1vbmV5IGFycml2ZWQ7IHJlbGVhc2VzIHRoZSBib25kLiBBdXRoOiBvcmRlciBzZW5kZXIuAAAAAAAAB2NvbmZpcm0AAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAElTZW5kZXIgcmVwb3J0cyBhIHByb2JsZW0gd2l0aGluIHRoZSBjaGFsbGVuZ2Ugd2luZG93LiBBdXRoOiBvcmRlciBzZW5kZXIuAAAAAAAAB2Rpc3B1dGUAAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAD5BbnlvbmU6IHJlbGVhc2UgdGhlIGJvbmQgb25jZSB0aGUgY2hhbGxlbmdlIHdpbmRvdyBoYXMgcGFzc2VkLgAAAAAAB3JlbGVhc2UAAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAElBZG1pbiBkZWNpZGVzIGEgZGlzcHV0ZS4gQXQgZmF1bHQ6IHNlbmRlciByZXBhaWQgKyBwZW5hbHR5IGZyb20gdGhlIGJvbmQuAAAAAAAAB3Jlc29sdmUAAAAAAgAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAAAAAA9hbmNob3JfYXRfZmF1bHQAAAAAAQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAADREZXBvc2l0IFVTREMgaW50byB0aGUgYW5jaG9yJ3MgYm9uZC4gQXV0aDogYGFuY2hvcmAuAAAACGFkZF9ib25kAAAAAgAAAAAAAAAGYW5jaG9yAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X29yZGVyAAAAAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAQAAA+kAAAfQAAAABU9yZGVyAAAAAAAAAw==",
        "AAAAAAAAAElBbmNob3IgcmVwb3J0cyB0aGUgcGF5b3V0IGFuZCByZWNlaXZlcyB0aGUgZXNjcm93ZWQgVVNEQy4gQXV0aDogYGFuY2hvcmAuAAAAAAAACW1hcmtfcGFpZAAAAAAAAAMAAAAAAAAABmFuY2hvcgAAAAAAEwAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAAAAAApwYXlvdXRfcmVmAAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAKZ2V0X2FuY2hvcgAAAAAAAQAAAAAAAAAGYW5jaG9yAAAAAAATAAAAAQAAA+kAAAfQAAAABkFuY2hvcgAAAAAAAw==",
        "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAPpAAAH0AAAAAZDb25maWcAAAAAAAM=",
        "AAAAAAAAAJtBY2NlcHQgYSBzaWduZWQgcXVvdGU6IHZlcmlmeSBpdCwgY2hlY2sgbWFya3VwIHZzIHRoZSBvcmFjbGUsIGVzY3JvdyB0aGUKc2VuZGVyJ3MgVVNEQyBhbmQgcmVzZXJ2ZSB0aGUgYW5jaG9yJ3MgYm9uZC4gUmV0dXJucyB0aGUgb3JkZXIgaWQuIEF1dGg6IGBzZW5kZXJgLgAAAAAKb3Blbl9vcmRlcgAAAAAABQAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAVxdW90ZQAAAAAAB9AAAAAFUXVvdGUAAAAAAAAAAAAACXNpZ25hdHVyZQAAAAAAA+4AAABAAAAAAAAAAA5yZWNpcGllbnRfaGFzaAAAAAAD7gAAACAAAAAAAAAADm1heF9tYXJrdXBfYnBzAAAAAAAEAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAACpBcHByb3ZlIG9yIHN1c3BlbmQgYW4gYW5jaG9yLiBBdXRoOiBhZG1pbi4AAAAAAApzZXRfYWN0aXZlAAAAAAACAAAAAAAAAAZhbmNob3IAAAAAABMAAAAAAAAABmFjdGl2ZQAAAAAAAQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAI1zaGEyNTYgb2YgdGhlIHF1b3RlJ3MgWERSLiBBbmNob3JzIHNpZ24gZXhhY3RseSB0aGVzZSAzMiBieXRlcy4KT2ZmLWNoYWluIGNvZGUgZ2V0cyB0aGVtIGJ5IHNpbXVsYXRpbmcgdGhpcyBmdW5jdGlvbiAobmV2ZXIgcmUtZW5jb2RlIGluIEpTKS4AAAAAAAAMcXVvdGVfZGlnZXN0AAAAAQAAAAAAAAAFcXVvdGUAAAAAAAfQAAAABVF1b3RlAAAAAAAAAQAAA+4AAAAg",
        "AAAAAAAAAEFSZXBsYWNlIHRoZSBjb25maWcgKGUuZy4gZGVtbyB0aW1lIHdpbmRvd3MpLiBBdXRoOiBjdXJyZW50IGFkbWluLgAAAAAAAA11cGRhdGVfY29uZmlnAAAAAAAAAQAAAAAAAAAGY29uZmlnAAAAAAfQAAAABkNvbmZpZwAAAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAClXaXRoZHJhdyB1bnJlc2VydmVkIGJvbmQuIEF1dGg6IGBhbmNob3JgLgAAAAAAAA13aXRoZHJhd19ib25kAAAAAAAAAgAAAAAAAAAGYW5jaG9yAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAFJBbnlvbmU6IGFmdGVyIGEgbWlzc2VkIHBheW91dCBkZWFkbGluZSwgcmVmdW5kIHRoZSBzZW5kZXIgKyBwZW5hbHR5IGZyb20gdGhlIGJvbmQuAAAAAAAOcmVmdW5kX2V4cGlyZWQAAAAAAAEAAAAAAAAACG9yZGVyX2lkAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAPbGlzdF9hbmNob3JfaWRzAAAAAAAAAAABAAAD6gAAABM=",
        "AAAAAAAAAEpSZWdpc3RlciBhcyBhbiBhbmNob3IgKGluYWN0aXZlIHVudGlsIHRoZSBhZG1pbiBhcHByb3ZlcykuIEF1dGg6IGBhbmNob3JgLgAAAAAAD3JlZ2lzdGVyX2FuY2hvcgAAAAADAAAAAAAAAAZhbmNob3IAAAAAABMAAAAAAAAAC3NpZ25pbmdfa2V5AAAAA+4AAAAgAAAAAAAAAAljb3JyaWRvcnMAAAAAAAPqAAAAEQAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAQZ2V0X3NlbmRlcl9saW1pdAAAAAEAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAEAAAPpAAAH0AAAAAtTZW5kZXJMaW1pdAAAAAAD",
        "AAAAAAAAAEhTZXQgYSBzZW5kZXIncyB0aWVyIGFuZCBkYWlseSBjYXAgKHN0YW5kLWluIGZvciBLWUMgdGllcnMpLiBBdXRoOiBhZG1pbi4AAAAQc2V0X3NlbmRlcl9saW1pdAAAAAMAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAEdGllcgAAAAQAAAAAAAAACWRhaWx5X2NhcAAAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAQAAAAAAAAAAAAAABU9yZGVyAAAAAAAACgAAABQwIHVudGlsIGBtYXJrX3BhaWRgLgAAAA5jaGFsbGVuZ2VfZW5kcwAAAAAABgAAAAAAAAACaWQAAAAAAAYAAAAAAAAACW9wZW5lZF9hdAAAAAAAAAYAAAAAAAAAD3BheW91dF9kZWFkbGluZQAAAAAGAAAAJnNoYTI1NiBvZiB0aGUgYW5jaG9yJ3MgcGF5b3V0IHJlY2VpcHQuAAAAAAAKcGF5b3V0X3JlZgAAAAAD6AAAA+4AAAAgAAAAAAAAAAVxdW90ZQAAAAAAB9AAAAAFUXVvdGUAAAAAAAA5c2hhMjU2IG9mIHRoZSByZWNpcGllbnQgZGV0YWlscy4gTmV2ZXIgcmF3IHBlcnNvbmFsIGRhdGEuAAAAAAAADnJlY2lwaWVudF9oYXNoAAAAAAPuAAAAIAAAAAAAAAANcmVzZXJ2ZWRfYm9uZAAAAAAAAAsAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAABlN0YXR1cwAA",
        "AAAAAQAAAAAAAAAAAAAABVF1b3RlAAAAAAAABwAAAAAAAAAGYW5jaG9yAAAAAAATAAAANExvY2FsIGN1cnJlbmN5IGNvZGUgZm9yIHRoZSBvcmFjbGUgbG9va3VwLCBlLmcuIE1YTi4AAAAKYXNzZXRfY29kZQAAAAAAEQAAAAAAAAAIY29ycmlkb3IAAAARAAAAAAAAAApleHBpcmVzX2F0AAAAAAAGAAAAS1doYXQgdGhlIHJlY2lwaWVudCByZWNlaXZlcyBBRlRFUiBhbGwgZmVlcywgaW4gbG9jYWwgY3VycmVuY3kgKDcgZGVjaW1hbHMpLgAAAAAMbGFuZGVkX2xvY2FsAAAACwAAAB9TaW5nbGUgdXNlIChyZXBsYXkgcHJvdGVjdGlvbikuAAAAAApyZXF1ZXN0X2lkAAAAAAPuAAAAIAAAAAAAAAAJc2VuZF91c2RjAAAAAAAACw==",
        "AAAAAQAAAAAAAAAAAAAABkFuY2hvcgAAAAAACAAAAAAAAAAGYWN0aXZlAAAAAAABAAAAElRvdGFsIFVTREMgYm9uZGVkLgAAAAAABGJvbmQAAAALAAAALkNvcnJpZG9ycyB0aGlzIGFuY2hvciBtYXkgc2VydmUsIGUuZy4gTVhfU1BFSS4AAAAAAAljb3JyaWRvcnMAAAAAAAPqAAAAEQAAAAAAAAAIZGlzcHV0ZWQAAAAEAAAAAAAAAAZmaWxsZWQAAAAAAAQAAAAtUGFydCBvZiB0aGUgYm9uZCBsb2NrZWQgYnkgdW5maW5pc2hlZCBvcmRlcnMuAAAAAAAACHJlc2VydmVkAAAACwAAACxlZDI1NTE5IHB1YmxpYyBrZXkgdXNlZCBPTkxZIHRvIHNpZ24gcXVvdGVzLgAAAAtzaWduaW5nX2tleQAAAAPuAAAAIAAAAAAAAAAHc2xhc2hlZAAAAAAE",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAACwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAXEJvbmQgcmVzZXJ2ZWQgcGVyIG9yZGVyLCBpbiBicHMgb2Ygc2VuZF91c2RjICgxMDUwMCA9IDEwNSUpLiBNdXN0IGJlID49IDEwMDAwICsgcGVuYWx0eV9icHMuAAAADmJvbmRfcmF0aW9fYnBzAAAAAAAEAAAAO1RpbWUgdGhlIHNlbmRlciBoYXMgdG8gZGlzcHV0ZSBhZnRlciBgbWFya19wYWlkYCAoZGVtbyA2MCkuAAAAABJjaGFsbGVuZ2Vfd2luZG93X3MAAAAAAAYAAAA1RGFpbHkgc2VuZGluZyBjYXAgZm9yIHNlbmRlcnMgd2l0aCBubyBleHBsaWNpdCBsaW1pdC4AAAAAAAARZGVmYXVsdF9kYWlseV9jYXAAAAAAAAALAAAAMUhhcmQgY2FwIG9uIG1hcmt1cCB2cyB0aGUgb3JhY2xlIHJhdGUgKDMwMCA9IDMlKS4AAAAAAAAWZGVmYXVsdF9tYXhfbWFya3VwX2JwcwAAAAAABAAAADBSZWplY3Qgb3JhY2xlIHByaWNlcyBvbGRlciB0aGFuIHRoaXMgKGUuZy4gNjAwKS4AAAAQbWF4X29yYWNsZV9hZ2VfcwAAAAYAAABTQW5jaG9yIGlzIGF1dG8tc3VzcGVuZGVkIHdoZW4gaXRzIHNsYXNoZWQgY291bnQgcmVhY2hlcyB0aGlzICgxID0gYWZ0ZXIgb25lIHNsYXNoKS4AAAAAC21heF9zbGFzaGVzAAAAAAQAAAAyUmVmbGVjdG9yLWNvbXBhdGlibGUgb3JhY2xlIChvdXIgbW9jayBvbiB0ZXN0bmV0KS4AAAAAAAZvcmFjbGUAAAAAABMAAAA9VGltZSB0aGUgYW5jaG9yIGhhcyB0byBwYXkgb3V0IGFmdGVyIGBvcGVuX29yZGVyYCAoZGVtbyAxMjApLgAAAAAAAA9wYXlvdXRfd2luZG93X3MAAAAABgAAAEpQZW5hbHR5IHBhaWQgdG8gdGhlIHNlbmRlciBmcm9tIHRoZSBib25kIHdoZW4gdGhlIGFuY2hvciBmYWlscyAoNTAwID0gNSUpLgAAAAAAC3BlbmFsdHlfYnBzAAAAAAQAAAAcVVNEQyBTdGVsbGFy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" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<Result<void>>,
        confirm: this.txFromJSON<Result<void>>,
        dispute: this.txFromJSON<Result<void>>,
        release: this.txFromJSON<Result<void>>,
        resolve: this.txFromJSON<Result<void>>,
        add_bond: this.txFromJSON<Result<void>>,
        get_order: this.txFromJSON<Result<Order>>,
        mark_paid: this.txFromJSON<Result<void>>,
        get_anchor: this.txFromJSON<Result<Anchor>>,
        get_config: this.txFromJSON<Result<Config>>,
        open_order: this.txFromJSON<Result<u64>>,
        set_active: this.txFromJSON<Result<void>>,
        quote_digest: this.txFromJSON<Buffer>,
        update_config: this.txFromJSON<Result<void>>,
        withdraw_bond: this.txFromJSON<Result<void>>,
        refund_expired: this.txFromJSON<Result<void>>,
        list_anchor_ids: this.txFromJSON<Array<string>>,
        register_anchor: this.txFromJSON<Result<void>>,
        get_sender_limit: this.txFromJSON<Result<SenderLimit>>,
        set_sender_limit: this.txFromJSON<Result<void>>
  }
}
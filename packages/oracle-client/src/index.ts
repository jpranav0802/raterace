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




export const OracleError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"InvalidPrice"}
}

export type Asset = {tag: "Stellar", values: readonly [string]} | {tag: "Other", values: readonly [string]};


export interface PriceData {
  /**
 * Price with `decimals()` decimals (14 for fiat feeds). USD per 1 unit of the asset.
 */
price: i128;
  /**
 * Unix seconds in our mock. (Reflector's unit is checked in issue #4.)
 */
timestamp: u64;
}

export interface Client {
  /**
   * Construct and simulate a init transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Store the admin. Callable once. Auth: `admin`.
   */
  init: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a assets transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Assets that have a price.
   */
  assets: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Asset>>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Always 14 (same as Reflector fiat feeds).
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a lastprice transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `None` if the asset has never been priced.
   */
  lastprice: ({asset}: {asset: Asset}, options?: MethodOptions) => Promise<AssembledTransaction<Option<PriceData>>>

  /**
   * Construct and simulate a set_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin only. Stores `price` with timestamp = current ledger time.
   */
  set_price: ({asset, price}: {asset: Asset, price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resolution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Always 300 seconds.
   */
  resolution: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_price_at transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin only. Stores `price` with the given timestamp (stale-price demo).
   */
  set_price_at: ({asset, price, timestamp}: {asset: Asset, price: i128, timestamp: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAAC09yYWNsZUVycm9yAAAAAAMAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAAAAAAAADEludmFsaWRQcmljZQAAAAM=",
        "AAAAAAAAAC5TdG9yZSB0aGUgYWRtaW4uIENhbGxhYmxlIG9uY2UuIEF1dGg6IGBhZG1pbmAuAAAAAAAEaW5pdAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAALT3JhY2xlRXJyb3IA",
        "AAAAAAAAABlBc3NldHMgdGhhdCBoYXZlIGEgcHJpY2UuAAAAAAAABmFzc2V0cwAAAAAAAAAAAAEAAAPqAAAH0AAAAAVBc3NldAAAAA==",
        "AAAAAAAAAClBbHdheXMgMTQgKHNhbWUgYXMgUmVmbGVjdG9yIGZpYXQgZmVlZHMpLgAAAAAAAAhkZWNpbWFscwAAAAAAAAABAAAABA==",
        "AAAAAAAAACpgTm9uZWAgaWYgdGhlIGFzc2V0IGhhcyBuZXZlciBiZWVuIHByaWNlZC4AAAAAAAlsYXN0cHJpY2UAAAAAAAABAAAAAAAAAAVhc3NldAAAAAAAB9AAAAAFQXNzZXQAAAAAAAABAAAD6AAAB9AAAAAJUHJpY2VEYXRhAAAA",
        "AAAAAAAAAEBBZG1pbiBvbmx5LiBTdG9yZXMgYHByaWNlYCB3aXRoIHRpbWVzdGFtcCA9IGN1cnJlbnQgbGVkZ2VyIHRpbWUuAAAACXNldF9wcmljZQAAAAAAAAIAAAAAAAAABWFzc2V0AAAAAAAH0AAAAAVBc3NldAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAQAAA+kAAAACAAAH0AAAAAtPcmFjbGVFcnJvcgA=",
        "AAAAAAAAABNBbHdheXMgMzAwIHNlY29uZHMuAAAAAApyZXNvbHV0aW9uAAAAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAEdBZG1pbiBvbmx5LiBTdG9yZXMgYHByaWNlYCB3aXRoIHRoZSBnaXZlbiB0aW1lc3RhbXAgKHN0YWxlLXByaWNlIGRlbW8pLgAAAAAMc2V0X3ByaWNlX2F0AAAAAwAAAAAAAAAFYXNzZXQAAAAAAAfQAAAABUFzc2V0AAAAAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAYAAAABAAAD6QAAAAIAAAfQAAAAC09yYWNsZUVycm9yAA==",
        "AAAAAgAAAAAAAAAAAAAABUFzc2V0AAAAAAAAAgAAAAEAAAAAAAAAB1N0ZWxsYXIAAAAAAQAAABMAAAABAAAAAAAAAAVPdGhlcgAAAAAAAAEAAAAR",
        "AAAAAQAAAAAAAAAAAAAACVByaWNlRGF0YQAAAAAAAAIAAABSUHJpY2Ugd2l0aCBgZGVjaW1hbHMoKWAgZGVjaW1hbHMgKDE0IGZvciBmaWF0IGZlZWRzKS4gVVNEIHBlciAxIHVuaXQgb2YgdGhlIGFzc2V0LgAAAAAABXByaWNlAAAAAAAACwAAAERVbml4IHNlY29uZHMgaW4gb3VyIG1vY2suIChSZWZsZWN0b3IncyB1bml0IGlzIGNoZWNrZWQgaW4gaXNzdWUgIzQuKQAAAAl0aW1lc3RhbXAAAAAAAAAG" ]),
      options
    )
  }
  public readonly fromJSON = {
    init: this.txFromJSON<Result<void>>,
        assets: this.txFromJSON<Array<Asset>>,
        decimals: this.txFromJSON<u32>,
        lastprice: this.txFromJSON<Option<PriceData>>,
        set_price: this.txFromJSON<Result<void>>,
        resolution: this.txFromJSON<u32>,
        set_price_at: this.txFromJSON<Result<void>>
  }
}
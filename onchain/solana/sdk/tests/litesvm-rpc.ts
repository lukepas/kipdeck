/**
 * The SDK's Rpc, answered by LiteSVM running the built program (target/deploy/bounty_escrow.so) with
 * the real SPL Token and Associated Token programs. SolanaEscrow runs on it unchanged, so these tests
 * exercise the same bytes devnet gets.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { address, getTransactionDecoder, lamports, type Address as KitAddress } from '@solana/kit';
import { Clock, FailedTransactionMetadata, LiteSVM } from 'litesvm';

// litesvm's InstructionErrorFieldless is a const enum (types only), in this order.
const FIELDLESS = 'GenericError InvalidArgument InvalidInstructionData InvalidAccountData AccountDataTooSmall InsufficientFunds IncorrectProgramId MissingRequiredSignature AccountAlreadyInitialized UninitializedAccount UnbalancedInstruction ModifiedProgramId ExternalAccountLamportSpend ExternalAccountDataModified ReadonlyLamportChange ReadonlyDataModified DuplicateAccountIndex ExecutableModified RentEpochModified NotEnoughAccountKeys AccountDataSizeChanged AccountNotExecutable AccountBorrowFailed AccountBorrowOutstanding DuplicateAccountOutOfSync InvalidError ExecutableDataModified ExecutableLamportChange ExecutableAccountNotRentExempt UnsupportedProgramId CallDepth MissingAccount ReentrancyNotAllowed MaxSeedLengthExceeded InvalidSeeds InvalidRealloc ComputationalBudgetExceeded PrivilegeEscalation ProgramEnvironmentSetupFailure ProgramFailedToComplete ProgramFailedToCompile Immutable IncorrectAuthority AccountNotRentExempt InvalidAccountOwner ArithmeticOverflow UnsupportedSysvar IllegalOwner'.split(' ');
import { EscrowError, Rpc, RpcError, TOKEN_PROGRAM_ID, associatedTokenAddress, decodeBase58, encodeBase58, type AccountData, type Address } from '../src/index.js';

export const PROGRAM_SO = fileURLToPath(new URL('../../target/deploy/bounty_escrow.so', import.meta.url));
export const HAVE_PROGRAM = existsSync(PROGRAM_SO);

export class LiteSvmRpc extends Rpc {
  readonly svm: LiteSVM;
  private logs = new Map<string, string[]>();

  constructor(readonly programId: Address) {
    super('http://127.0.0.1/litesvm');
    this.svm = new LiteSVM();
    this.svm.addProgramFromFile(address(programId), PROGRAM_SO);
  }

  override async account(a: string): Promise<AccountData | undefined> {
    const acc = this.svm.getAccount(address(a));
    if (!acc.exists) return undefined;
    return { owner: acc.programAddress, lamports: Number(acc.lamports), data: new Uint8Array(acc.data) };
  }

  override async programAccounts(programId: string, filters: any[]): Promise<{ address: string; account: AccountData }[]> {
    return this.svm
      .getProgramAccounts(address(programId))
      .filter((acc) =>
        filters.every((f) => {
          if (f.dataSize !== undefined) return acc.data.length === f.dataSize;
          const want = decodeBase58(f.memcmp.bytes);
          return Buffer.from(acc.data.subarray(f.memcmp.offset, f.memcmp.offset + want.length)).equals(Buffer.from(want));
        }),
      )
      .map((acc) => ({ address: acc.address, account: { owner: acc.programAddress, lamports: Number(acc.lamports), data: new Uint8Array(acc.data) } }));
  }

  override async latestBlockhash() {
    return { blockhash: this.svm.latestBlockhash() as string, lastValidBlockHeight: 1_000_000 };
  }

  override async blockHeight() {
    return 1;
  }

  override async genesisHash(): Promise<string> {
    return 'litesvm';
  }

  override async send(wire: Uint8Array): Promise<string> {
    const tx = getTransactionDecoder().decode(wire);
    const result = this.svm.sendTransaction(tx);
    if (result instanceof FailedTransactionMetadata) {
      const err: any = result.err();
      if (typeof err?.index === 'number' && typeof err.err === 'function') {
        const inner = err.err();
        if (typeof inner?.code === 'number') {
          const known = EscrowError.fromCode(inner.code);
          if (known) throw known;
        }
        const name = typeof inner === 'number' ? (FIELDLESS[inner] ?? String(inner)) : String(inner);
        throw new RpcError(`instruction ${err.index} failed: ${name}`, undefined, result.meta().logs());
      }
      throw new RpcError(`transaction failed: ${String(err)}`, undefined, result.meta().logs());
    }
    const signature = encodeBase58(result.signature());
    this.logs.set(signature, result.logs());
    // Each transaction gets a fresh blockhash, so two identical ones in a row aren't duplicates.
    this.svm.expireBlockhash();
    return signature;
  }

  override async signatureStatus(signature: string) {
    return this.logs.has(signature) ? { confirmationStatus: 'confirmed' as const, err: null } : null;
  }

  override async transactionLogs(signature: string): Promise<string[]> {
    return this.logs.get(signature) ?? [];
  }

  /** The cluster's clock, set to a unix time. */
  setTime(unix: number) {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(unix)));
  }

  fundSol(who: Address, sol = 10) {
    this.svm.airdrop(address(who), lamports(BigInt(sol * 1e9)));
  }

  /** An initialized mint at `at` (any address: LiteSVM lets a test write it). */
  createMint(at: Address, decimals = 6) {
    const data = new Uint8Array(82);
    data[44] = decimals;
    data[45] = 1;
    this.put(at, TOKEN_PROGRAM_ID, data);
  }

  /** `owner`'s associated token account for `mint`, holding `amount`. */
  giveTokens(owner: Address, mint: Address, amount: bigint): Address {
    const ata = associatedTokenAddress(owner, mint);
    const data = new Uint8Array(165);
    data.set(decodeBase58(mint), 0);
    data.set(decodeBase58(owner), 32);
    new DataView(data.buffer).setBigUint64(64, amount, true);
    data[108] = 1;
    this.put(ata, TOKEN_PROGRAM_ID, data);
    return ata;
  }

  private put(at: Address, owner: Address, data: Uint8Array) {
    this.svm.setAccount({ address: address(at), data, executable: false, lamports: this.svm.minimumBalanceForRentExemption(BigInt(data.length)) as any, programAddress: address(owner) as KitAddress, space: BigInt(data.length) });
  }
}

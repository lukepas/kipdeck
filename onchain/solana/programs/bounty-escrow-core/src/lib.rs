//! The bounty escrow without Solana: its accounts, instructions and events as bytes, and every rule
//! for moving a bounty from open to claimed, released, refunded or cancelled.
//!
//! Anyone opens a bounty for one GitHub issue and anyone funds it in an allowed SPL token (devnet
//! USDC). Each funder has a contribution of their own, so each can be paid back on their own. The
//! office's attester key binds the bounty to the pull request an office worker opened for it (Claim).
//! Paying out (Release) needs two signatures: the attester's, which says GitHub reports the PR merged
//! by a person with write access, and the approver's, which says an office admin approved the payout.
//! If nothing is released by the expiry, anyone can crank the contributions back to their funders.
//!
//! The on-chain program (`bounty-escrow`) checks accounts and moves tokens. Every decision about
//! whether a step is allowed is made here, and the TypeScript SDK's mock follows the same table of
//! cases (`fixtures/transitions.json`), so the office can be tested without a validator.

pub mod bytes;
pub mod error;
pub mod event;
pub mod instruction;
pub mod machine;
pub mod state;

pub use error::EscrowError;

/// A public key, as the program sees it: 32 bytes.
pub type Key = [u8; 32];

/// The all-zero key: "nobody yet".
pub const NO_KEY: Key = [0; 32];

/// Seed prefix of a bounty account: then sha256 of the lowercased "owner/name", the issue number
/// (u64 LE), a one-byte nonce (so an issue can get a fresh bounty after one was settled), and the
/// attester's and the approver's keys. With the keys in the seeds, nobody can open a bounty at the
/// address an office's bounty for that issue would have, with keys the office doesn't hold.
pub const BOUNTY_SEED: &[u8] = b"bounty";
/// Seed prefix of a contribution account: then the bounty's address and the funder's.
pub const CONTRIB_SEED: &[u8] = b"contrib";

/// The longest a bounty may run from the moment it is opened: a year and a day.
pub const MAX_DURATION_SECS: i64 = 366 * 24 * 60 * 60;

/// Circle's USDC on Solana devnet, 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU.
pub const DEVNET_USDC_MINT: Key = [
    59, 68, 44, 179, 145, 33, 87, 241, 58, 147, 61, 1, 52, 40, 45, 3, 43, 95, 254, 205, 1, 162, 219, 241, 183, 121, 6, 8, 223, 0, 46, 167,
];

/// A test mint standing in for USDC on devnet and in local tests,
/// 9CL3xM1UNUQk7XqKz8JHbYhPNH9iwZF4mU67sjSEzbMz. Allowed only in a build with the `test-mint`
/// feature, so a build without it accepts devnet USDC alone.
pub const TEST_MINT: Key = [
    121, 196, 108, 222, 150, 24, 140, 23, 230, 136, 180, 240, 33, 224, 214, 207, 134, 242, 169, 79, 3, 34, 69, 234, 61, 6, 124, 61, 131, 91, 84, 97,
];

/// The mints bounties may be paid in, compiled in. There is no mainnet entry on purpose.
pub fn allowed_mints() -> &'static [Key] {
    #[cfg(feature = "test-mint")]
    {
        &[DEVNET_USDC_MINT, TEST_MINT]
    }
    #[cfg(not(feature = "test-mint"))]
    {
        &[DEVNET_USDC_MINT]
    }
}

pub fn mint_allowed(mint: &Key) -> bool {
    allowed_mints().contains(mint)
}

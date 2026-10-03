//! What a transaction asks the program to do: a tag byte, then that instruction's fields,
//! little-endian. The accounts each one takes are listed on the variant, in order; the SDK passes
//! them the same way.

use crate::bytes::{Reader, Writer};
use crate::{EscrowError, Key};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EscrowInstruction {
    /// Opens a bounty for an issue. Anyone may pay for it. The mint must be on the allowlist.
    ///
    /// Accounts: payer (signer, writable), bounty (writable, PDA ["bounty", repo_hash, issue LE,
    /// nonce]), vault (writable, the bounty's associated token account), mint, system program,
    /// token program, associated token program.
    InitBounty { repo_hash: Key, issue: u64, nonce: u8, expiry_ts: i64, attester: Key, approver: Key },

    /// Puts `amount` into the vault and records it on the funder's contribution. Open or claimed,
    /// and before the expiry.
    ///
    /// Accounts: funder (signer, writable), bounty (writable), vault (writable), contribution
    /// (writable, PDA ["contrib", bounty, funder]), funder's token account (writable), mint, token
    /// program, system program.
    Fund { amount: u64 },

    /// The attester binds the office pull request and the wallet to pay. It may bind again (a
    /// re-opened PR) until the bounty is released.
    ///
    /// Accounts: attester (signer), bounty (writable).
    Claim { pr_number: u64, claimant_wallet: Key },

    /// Pays the whole vault to the claimant's associated token account, made if missing with the
    /// payer covering its rent. Needs the attester's and the approver's signatures.
    ///
    /// Accounts: payer (signer, writable), attester (signer), approver (signer), bounty (writable),
    /// vault (writable), claimant wallet, claimant's token account (writable), mint, system program,
    /// token program, associated token program.
    Release { merge_sha: [u8; 20], merged_by_hash: Key, pr_number: u64 },

    /// After the expiry (or once cancelled), pays one contribution back to its funder. Anyone may
    /// crank it, one contribution per instruction.
    ///
    /// Accounts: bounty (writable), vault (writable), contribution (writable), funder's token
    /// account (writable), mint, token program.
    Refund,

    /// Calls a bounty off. Empty (nothing funded): its creator or the approver signs, its accounts
    /// are closed and the rent goes back to the creator. Funded but not yet claimed: the approver
    /// signs, and the funders get their money back through Refund.
    ///
    /// Accounts: bounty (writable), vault (writable), creator (writable; a signer when the creator
    /// calls it off), token program, and the approver (signer) when the approver calls it off.
    Cancel,
}

pub const TAG_INIT_BOUNTY: u8 = 0;
pub const TAG_FUND: u8 = 1;
pub const TAG_CLAIM: u8 = 2;
pub const TAG_RELEASE: u8 = 3;
pub const TAG_REFUND: u8 = 4;
pub const TAG_CANCEL: u8 = 5;

impl EscrowInstruction {
    /// The longest instruction, in bytes (InitBounty).
    pub const MAX_LEN: usize = 1 + 32 + 8 + 1 + 8 + 32 + 32;

    pub fn unpack(data: &[u8]) -> Result<Self, EscrowError> {
        let (&tag, _) = data.split_first().ok_or(EscrowError::InvalidInstruction)?;
        let mut r = Reader::new(&data[1..]);
        let ix = match tag {
            TAG_INIT_BOUNTY => EscrowInstruction::InitBounty { repo_hash: r.key()?, issue: r.u64()?, nonce: r.u8()?, expiry_ts: r.i64()?, attester: r.key()?, approver: r.key()? },
            TAG_FUND => EscrowInstruction::Fund { amount: r.u64()? },
            TAG_CLAIM => EscrowInstruction::Claim { pr_number: r.u64()?, claimant_wallet: r.key()? },
            TAG_RELEASE => EscrowInstruction::Release { merge_sha: r.bytes20()?, merged_by_hash: r.key()?, pr_number: r.u64()? },
            TAG_REFUND => EscrowInstruction::Refund,
            TAG_CANCEL => EscrowInstruction::Cancel,
            _ => return Err(EscrowError::InvalidInstruction),
        };
        r.finish()?;
        Ok(ix)
    }

    pub fn pack(&self) -> Vec<u8> {
        let mut buf = [0u8; Self::MAX_LEN];
        let mut w = Writer::new(&mut buf);
        // The buffer fits the longest instruction, so none of these can run out of room.
        let fits = match self {
            EscrowInstruction::InitBounty { repo_hash, issue, nonce, expiry_ts, attester, approver } => {
                w.u8(TAG_INIT_BOUNTY).and(w.put(repo_hash)).and(w.u64(*issue)).and(w.u8(*nonce)).and(w.i64(*expiry_ts)).and(w.put(attester)).and(w.put(approver))
            }
            EscrowInstruction::Fund { amount } => w.u8(TAG_FUND).and(w.u64(*amount)),
            EscrowInstruction::Claim { pr_number, claimant_wallet } => w.u8(TAG_CLAIM).and(w.u64(*pr_number)).and(w.put(claimant_wallet)),
            EscrowInstruction::Release { merge_sha, merged_by_hash, pr_number } => w.u8(TAG_RELEASE).and(w.put(merge_sha)).and(w.put(merged_by_hash)).and(w.u64(*pr_number)),
            EscrowInstruction::Refund => w.u8(TAG_REFUND),
            EscrowInstruction::Cancel => w.u8(TAG_CANCEL),
        };
        debug_assert!(fits.is_ok());
        let len = w.len();
        buf[..len].to_vec()
    }
}

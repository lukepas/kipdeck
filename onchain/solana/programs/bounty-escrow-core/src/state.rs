//! The program's two kinds of account. Each starts with a kind byte and a layout version, so a
//! bounty can never be read as a contribution or the other way round. Every field sits at a fixed
//! offset, so getProgramAccounts can filter on it with memcmp.

use crate::bytes::{Reader, Writer};
use crate::{EscrowError, Key};

pub const BOUNTY_KIND: u8 = 2;
pub const CONTRIBUTION_KIND: u8 = 3;
pub const LAYOUT_VERSION: u8 = 2;

/// Where a bounty is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum BountyState {
    /// Funded (or waiting to be), no pull request bound yet.
    Open = 0,
    /// The attester bound an office pull request and the wallet to pay.
    Claimed = 1,
    /// Paid to the claimant after a person merged the PR and an admin approved.
    Released = 2,
    /// Expired unpaid, and every contribution was cranked back to its funder.
    Refunded = 3,
    /// The approver called it off before a claim; contributions go back through the refund crank.
    Cancelled = 4,
}

impl BountyState {
    pub fn from_u8(v: u8) -> Result<Self, EscrowError> {
        match v {
            0 => Ok(BountyState::Open),
            1 => Ok(BountyState::Claimed),
            2 => Ok(BountyState::Released),
            3 => Ok(BountyState::Refunded),
            4 => Ok(BountyState::Cancelled),
            _ => Err(EscrowError::InvalidData),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            BountyState::Open => "open",
            BountyState::Claimed => "claimed",
            BountyState::Released => "released",
            BountyState::Refunded => "refunded",
            BountyState::Cancelled => "cancelled",
        }
    }

    /// Whether nothing can move it any more.
    pub fn settled(self) -> bool {
        matches!(self, BountyState::Released | BountyState::Refunded)
    }
}

/// One bounty on one GitHub issue. The account outlives the payout, so anyone can see who was paid
/// for which pull request and merge.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bounty {
    pub state: BountyState,
    pub bump: u8,
    pub nonce: u8,
    pub mint: Key,
    /// The associated token account of the bounty PDA for `mint`.
    pub vault: Key,
    /// sha256 of the repository's "owner/name", lowercased.
    pub repo_hash: Key,
    pub issue: u64,
    /// The office key that binds pull requests and vouches for merges.
    pub attester: Key,
    /// The office admin key that must co-sign every release.
    pub approver: Key,
    /// Who paid the account's rent, and gets it back if the bounty is cancelled empty.
    pub creator: Key,
    pub created_at: i64,
    pub expiry_ts: i64,
    /// Everything funded, in the mint's base units (1 USDC is 1_000_000).
    pub total: u64,
    pub funder_count: u16,
    pub refunded_count: u16,
    /// The agent operator's wallet, once a PR is claimed.
    pub claimant_wallet: Option<Key>,
    pub pr_number: Option<u64>,
    pub claimed_at: i64,
    /// The merge commit, as git's 20 bytes; zero until released.
    pub merge_sha: [u8; 20],
    /// sha256 of the merging GitHub user's numeric id (decimal), so the person stays off chain.
    pub merged_by_hash: Key,
    /// What the release paid (the whole vault).
    pub paid: u64,
    /// When it was released, refunded in full or cancelled; zero until then.
    pub settled_at: i64,
}

impl Bounty {
    pub const LEN: usize = 5 + 32 * 3 + 8 + 32 * 3 + 8 * 2 + 8 + 2 * 2 + 33 + 9 + 8 + 20 + 32 + 8 * 2;

    pub fn pack(&self, out: &mut [u8]) -> Result<(), EscrowError> {
        if out.len() != Self::LEN {
            return Err(EscrowError::InvalidData);
        }
        let mut w = Writer::new(out);
        w.u8(BOUNTY_KIND)?;
        w.u8(LAYOUT_VERSION)?;
        w.u8(self.state as u8)?;
        w.u8(self.bump)?;
        w.u8(self.nonce)?;
        w.put(&self.mint)?;
        w.put(&self.vault)?;
        w.put(&self.repo_hash)?;
        w.u64(self.issue)?;
        w.put(&self.attester)?;
        w.put(&self.approver)?;
        w.put(&self.creator)?;
        w.i64(self.created_at)?;
        w.i64(self.expiry_ts)?;
        w.u64(self.total)?;
        w.u16(self.funder_count)?;
        w.u16(self.refunded_count)?;
        w.opt_key(&self.claimant_wallet)?;
        w.opt_u64(self.pr_number)?;
        w.i64(self.claimed_at)?;
        w.put(&self.merge_sha)?;
        w.put(&self.merged_by_hash)?;
        w.u64(self.paid)?;
        w.i64(self.settled_at)
    }

    pub fn unpack(data: &[u8]) -> Result<Self, EscrowError> {
        let mut r = Reader::new(data);
        if r.u8()? != BOUNTY_KIND || r.u8()? != LAYOUT_VERSION {
            return Err(EscrowError::InvalidData);
        }
        let b = Bounty {
            state: BountyState::from_u8(r.u8()?)?,
            bump: r.u8()?,
            nonce: r.u8()?,
            mint: r.key()?,
            vault: r.key()?,
            repo_hash: r.key()?,
            issue: r.u64()?,
            attester: r.key()?,
            approver: r.key()?,
            creator: r.key()?,
            created_at: r.i64()?,
            expiry_ts: r.i64()?,
            total: r.u64()?,
            funder_count: r.u16()?,
            refunded_count: r.u16()?,
            claimant_wallet: r.opt_key()?,
            pr_number: r.opt_u64()?,
            claimed_at: r.i64()?,
            merge_sha: r.bytes20()?,
            merged_by_hash: r.key()?,
            paid: r.u64()?,
            settled_at: r.i64()?,
        };
        r.finish()?;
        Ok(b)
    }
}

/// Byte offset of `repo_hash` in a bounty account, for listing a repository's bounties with
/// getProgramAccounts' memcmp.
pub const BOUNTY_REPO_HASH_OFFSET: usize = 5 + 32 + 32;

/// What one funder put into one bounty, so each can be paid back on their own.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Contribution {
    pub bump: u8,
    pub refunded: bool,
    pub bounty: Key,
    pub funder: Key,
    pub amount: u64,
}

impl Contribution {
    pub const LEN: usize = 4 + 32 * 2 + 8;

    pub fn pack(&self, out: &mut [u8]) -> Result<(), EscrowError> {
        if out.len() != Self::LEN {
            return Err(EscrowError::InvalidData);
        }
        let mut w = Writer::new(out);
        w.u8(CONTRIBUTION_KIND)?;
        w.u8(LAYOUT_VERSION)?;
        w.u8(self.bump)?;
        w.u8(self.refunded as u8)?;
        w.put(&self.bounty)?;
        w.put(&self.funder)?;
        w.u64(self.amount)
    }

    pub fn unpack(data: &[u8]) -> Result<Self, EscrowError> {
        let mut r = Reader::new(data);
        if r.u8()? != CONTRIBUTION_KIND || r.u8()? != LAYOUT_VERSION {
            return Err(EscrowError::InvalidData);
        }
        let bump = r.u8()?;
        let refunded = match r.u8()? {
            0 => false,
            1 => true,
            _ => return Err(EscrowError::InvalidData),
        };
        let c = Contribution { bump, refunded, bounty: r.key()?, funder: r.key()?, amount: r.u64()? };
        r.finish()?;
        Ok(c)
    }
}

/// Byte offset of `bounty` in a contribution account, for listing a bounty's funders.
pub const CONTRIBUTION_BOUNTY_OFFSET: usize = 4;

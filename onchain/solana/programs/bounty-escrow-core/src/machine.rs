//! Every rule about when a bounty may be opened, funded, claimed, released, refunded or cancelled.
//! The program calls these with what it read from its accounts and the clock; nothing here knows
//! about Solana.
//!
//! Checks run in a fixed order (who is asking, then the bounty's state, then the clock, then the
//! arguments), so the Rust and TypeScript sides refuse the same step with the same error.

use crate::state::{Bounty, BountyState, Contribution};
use crate::{mint_allowed, EscrowError, Key, MAX_DURATION_SECS, NO_KEY};

/// What InitBounty asks for, plus what the program found: the PDA's bump, the vault's address and
/// who paid.
#[derive(Clone, Debug)]
pub struct InitArgs {
    pub repo_hash: Key,
    pub issue: u64,
    pub nonce: u8,
    pub mint: Key,
    pub vault: Key,
    pub expiry_ts: i64,
    pub attester: Key,
    pub approver: Key,
    pub creator: Key,
    pub bump: u8,
}

/// A new open, empty bounty.
pub fn init(a: InitArgs, now: i64) -> Result<Bounty, EscrowError> {
    if !mint_allowed(&a.mint) {
        return Err(EscrowError::MintNotAllowed);
    }
    if a.attester == NO_KEY || a.approver == NO_KEY {
        return Err(EscrowError::InvalidRecipient);
    }
    // Two keys, so a release always takes two parties: the office's attester and an admin.
    if a.attester == a.approver {
        return Err(EscrowError::SameAuthority);
    }
    if a.issue == 0 {
        return Err(EscrowError::InvalidData);
    }
    if a.expiry_ts <= now || a.expiry_ts.saturating_sub(now) > MAX_DURATION_SECS {
        return Err(EscrowError::InvalidExpiry);
    }
    Ok(Bounty {
        state: BountyState::Open,
        bump: a.bump,
        nonce: a.nonce,
        mint: a.mint,
        vault: a.vault,
        repo_hash: a.repo_hash,
        issue: a.issue,
        attester: a.attester,
        approver: a.approver,
        creator: a.creator,
        created_at: now,
        expiry_ts: a.expiry_ts,
        total: 0,
        funder_count: 0,
        refunded_count: 0,
        claimant_wallet: None,
        pr_number: None,
        claimed_at: 0,
        merge_sha: [0; 20],
        merged_by_hash: NO_KEY,
        paid: 0,
        settled_at: 0,
    })
}

/// A funder adds `amount`. `contribution` is theirs so far (None the first time); returns it
/// updated. Open or claimed only, and up to the second the bounty expires.
pub fn fund(b: &mut Bounty, contribution: Option<Contribution>, funder: &Key, amount: u64, bump: u8, bounty_key: &Key, now: i64) -> Result<Contribution, EscrowError> {
    if !matches!(b.state, BountyState::Open | BountyState::Claimed) {
        return Err(EscrowError::WrongState);
    }
    if now > b.expiry_ts {
        return Err(EscrowError::Expired);
    }
    if amount == 0 {
        return Err(EscrowError::InvalidAmount);
    }
    let total = b.total.checked_add(amount).ok_or(EscrowError::Overflow)?;
    let c = match contribution {
        Some(mut c) => {
            if &c.funder != funder || &c.bounty != bounty_key {
                return Err(EscrowError::WrongAccount);
            }
            c.amount = c.amount.checked_add(amount).ok_or(EscrowError::Overflow)?;
            c
        }
        None => {
            b.funder_count = b.funder_count.checked_add(1).ok_or(EscrowError::Overflow)?;
            Contribution { bump, refunded: false, bounty: *bounty_key, funder: *funder, amount }
        }
    };
    b.total = total;
    Ok(c)
}

/// The attester binds pull request `pr_number` and the wallet to pay. A later claim re-binds (a
/// re-opened PR, another worker) until the bounty is released.
pub fn claim(b: &mut Bounty, signer: &Key, pr_number: u64, claimant_wallet: &Key, now: i64) -> Result<(), EscrowError> {
    if signer != &b.attester {
        return Err(EscrowError::Unauthorized);
    }
    if !matches!(b.state, BountyState::Open | BountyState::Claimed) {
        return Err(EscrowError::WrongState);
    }
    if now > b.expiry_ts {
        return Err(EscrowError::Expired);
    }
    if pr_number == 0 {
        return Err(EscrowError::InvalidPullRequest);
    }
    if claimant_wallet == &NO_KEY {
        return Err(EscrowError::InvalidRecipient);
    }
    b.state = BountyState::Claimed;
    b.pr_number = Some(pr_number);
    b.claimant_wallet = Some(*claimant_wallet);
    b.claimed_at = now;
    Ok(())
}

/// What Release is told and who signed it.
#[derive(Clone, Debug)]
pub struct ReleaseArgs {
    /// Who signed as the attester and as the approver (NO_KEY when that account didn't sign).
    pub attester: Key,
    pub approver: Key,
    pub pr_number: u64,
    pub merge_sha: [u8; 20],
    pub merged_by_hash: Key,
    /// What the vault holds: all of it is paid, so tokens sent to the vault directly aren't stuck.
    pub vault_balance: u64,
}

/// Pays the claimed bounty out. Needs both the attester and the approver. Returns the amount paid.
pub fn release(b: &mut Bounty, a: &ReleaseArgs, now: i64) -> Result<u64, EscrowError> {
    if a.attester != b.attester || a.approver != b.approver {
        return Err(EscrowError::Unauthorized);
    }
    if b.state != BountyState::Claimed {
        return Err(EscrowError::WrongState);
    }
    if now > b.expiry_ts {
        return Err(EscrowError::Expired);
    }
    if a.pr_number == 0 {
        return Err(EscrowError::InvalidPullRequest);
    }
    if b.pr_number != Some(a.pr_number) {
        return Err(EscrowError::PullRequestMismatch);
    }
    if b.total == 0 {
        return Err(EscrowError::InvalidAmount);
    }
    if a.vault_balance < b.total {
        return Err(EscrowError::InvalidData);
    }
    b.state = BountyState::Released;
    b.merge_sha = a.merge_sha;
    b.merged_by_hash = a.merged_by_hash;
    b.paid = a.vault_balance;
    b.settled_at = now;
    Ok(a.vault_balance)
}

/// Pays one contribution back. Anyone may ask, once the bounty expired unreleased or was
/// cancelled. Returns the amount, and marks the bounty refunded when it was the last one.
pub fn refund(b: &mut Bounty, c: &mut Contribution, bounty_key: &Key, now: i64) -> Result<u64, EscrowError> {
    if &c.bounty != bounty_key {
        return Err(EscrowError::WrongAccount);
    }
    match b.state {
        BountyState::Released | BountyState::Refunded => return Err(EscrowError::WrongState),
        BountyState::Cancelled => {}
        BountyState::Open | BountyState::Claimed => {
            if now <= b.expiry_ts {
                return Err(EscrowError::NotExpired);
            }
        }
    }
    if c.refunded {
        return Err(EscrowError::AlreadyRefunded);
    }
    c.refunded = true;
    b.refunded_count = b.refunded_count.checked_add(1).ok_or(EscrowError::Overflow)?;
    if b.refunded_count >= b.funder_count {
        if b.state != BountyState::Cancelled {
            b.state = BountyState::Refunded;
        }
        b.settled_at = now;
    }
    Ok(c.amount)
}

/// What a cancel does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cancel {
    /// Nothing was funded: close the accounts, rent back to the creator.
    Close,
    /// Funded, not claimed: the approver called it off and the refund crank opens now.
    Refunds,
}

/// Calls a bounty off. `approver` is who signed as the approver (NO_KEY if nobody did).
pub fn cancel(b: &mut Bounty, approver: &Key, vault_balance: u64, now: i64) -> Result<Cancel, EscrowError> {
    if b.total == 0 {
        if !matches!(b.state, BountyState::Open | BountyState::Claimed) {
            return Err(EscrowError::WrongState);
        }
        // Tokens someone sent to the vault directly would be stuck in a closed vault.
        if vault_balance != 0 {
            return Err(EscrowError::InvalidData);
        }
        b.state = BountyState::Cancelled;
        b.settled_at = now;
        return Ok(Cancel::Close);
    }
    if approver != &b.approver {
        return Err(EscrowError::Unauthorized);
    }
    if b.state != BountyState::Open {
        return Err(EscrowError::WrongState);
    }
    b.state = BountyState::Cancelled;
    Ok(Cancel::Refunds)
}

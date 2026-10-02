//! What the program logs on every change of state, with `sol_log_data`: a one-byte discriminator,
//! then the event's fields little-endian (borsh's layout for these types). An indexer follows
//! bounties from these alone; it reads only `Program data:` lines logged inside this program's own
//! invocation, so another program's logs can't pass for them.

use crate::bytes::Writer;
use crate::Key;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EscrowEvent {
    BountyCreated { bounty: Key, repo_hash: Key, issue: u64, nonce: u8, mint: Key, attester: Key, approver: Key, creator: Key, expiry_ts: i64 },
    Funded { bounty: Key, funder: Key, amount: u64, contribution: u64, total: u64 },
    Claimed { bounty: Key, pr_number: u64, claimant_wallet: Key },
    Released { bounty: Key, claimant_wallet: Key, amount: u64, pr_number: u64, merge_sha: [u8; 20], merged_by_hash: Key, attester: Key, approver: Key },
    Refunded { bounty: Key, funder: Key, amount: u64, remaining: u16 },
    Cancelled { bounty: Key, total: u64, closed: bool },
}

pub const EVENT_BOUNTY_CREATED: u8 = 0;
pub const EVENT_FUNDED: u8 = 1;
pub const EVENT_CLAIMED: u8 = 2;
pub const EVENT_RELEASED: u8 = 3;
pub const EVENT_REFUNDED: u8 = 4;
pub const EVENT_CANCELLED: u8 = 5;

impl EscrowEvent {
    /// The longest event, in bytes (BountyCreated).
    pub const MAX_LEN: usize = 1 + 32 + 32 + 8 + 1 + 32 * 4 + 8;

    pub fn tag(&self) -> u8 {
        match self {
            EscrowEvent::BountyCreated { .. } => EVENT_BOUNTY_CREATED,
            EscrowEvent::Funded { .. } => EVENT_FUNDED,
            EscrowEvent::Claimed { .. } => EVENT_CLAIMED,
            EscrowEvent::Released { .. } => EVENT_RELEASED,
            EscrowEvent::Refunded { .. } => EVENT_REFUNDED,
            EscrowEvent::Cancelled { .. } => EVENT_CANCELLED,
        }
    }

    pub fn pack(&self) -> Vec<u8> {
        let mut buf = [0u8; Self::MAX_LEN];
        let mut w = Writer::new(&mut buf);
        let head = w.u8(self.tag());
        // The buffer fits the longest event, so none of these can run out of room.
        let body = match self {
            EscrowEvent::BountyCreated { bounty, repo_hash, issue, nonce, mint, attester, approver, creator, expiry_ts } => w
                .put(bounty)
                .and(w.put(repo_hash))
                .and(w.u64(*issue))
                .and(w.u8(*nonce))
                .and(w.put(mint))
                .and(w.put(attester))
                .and(w.put(approver))
                .and(w.put(creator))
                .and(w.i64(*expiry_ts)),
            EscrowEvent::Funded { bounty, funder, amount, contribution, total } => w.put(bounty).and(w.put(funder)).and(w.u64(*amount)).and(w.u64(*contribution)).and(w.u64(*total)),
            EscrowEvent::Claimed { bounty, pr_number, claimant_wallet } => w.put(bounty).and(w.u64(*pr_number)).and(w.put(claimant_wallet)),
            EscrowEvent::Released { bounty, claimant_wallet, amount, pr_number, merge_sha, merged_by_hash, attester, approver } => w
                .put(bounty)
                .and(w.put(claimant_wallet))
                .and(w.u64(*amount))
                .and(w.u64(*pr_number))
                .and(w.put(merge_sha))
                .and(w.put(merged_by_hash))
                .and(w.put(attester))
                .and(w.put(approver)),
            EscrowEvent::Refunded { bounty, funder, amount, remaining } => w.put(bounty).and(w.put(funder)).and(w.u64(*amount)).and(w.u16(*remaining)),
            EscrowEvent::Cancelled { bounty, total, closed } => w.put(bounty).and(w.u64(*total)).and(w.u8(*closed as u8)),
        };
        debug_assert!(head.and(body).is_ok());
        let len = w.len();
        buf[..len].to_vec()
    }
}

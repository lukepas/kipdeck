//! Accounts, instructions and events read back what was written, and refuse what isn't theirs.

use bounty_escrow_core::event::{EscrowEvent, EVENT_RELEASED};
use bounty_escrow_core::instruction::{EscrowInstruction, TAG_FUND};
use bounty_escrow_core::machine::{self, InitArgs, ReleaseArgs};
use bounty_escrow_core::state::{Bounty, BountyState, Contribution, BOUNTY_REPO_HASH_OFFSET, CONTRIBUTION_BOUNTY_OFFSET};
use bounty_escrow_core::{mint_allowed, EscrowError, DEVNET_USDC_MINT, TEST_MINT};

fn opened() -> Bounty {
    machine::init(
        InitArgs { repo_hash: [7; 32], issue: 12, nonce: 0, mint: DEVNET_USDC_MINT, vault: [11; 32], expiry_ts: 2000, attester: [2; 32], approver: [3; 32], creator: [7; 32], bump: 254 },
        1000,
    )
    .unwrap()
}

#[test]
fn a_bounty_round_trips_and_keeps_its_repo_hash_where_filters_look() {
    let b = opened();
    let mut data = vec![0u8; Bounty::LEN];
    b.pack(&mut data).unwrap();
    assert_eq!(Bounty::unpack(&data).unwrap(), b);
    assert_eq!(&data[BOUNTY_REPO_HASH_OFFSET..BOUNTY_REPO_HASH_OFFSET + 32], &[7u8; 32]);
    assert_eq!(Bounty::LEN, 351);
}

#[test]
fn a_contribution_keeps_its_bounty_where_filters_look() {
    let c = Contribution { bump: 250, refunded: false, bounty: [8; 32], funder: [1; 32], amount: 5 };
    let mut data = vec![0u8; Contribution::LEN];
    c.pack(&mut data).unwrap();
    assert_eq!(Contribution::unpack(&data).unwrap(), c);
    assert_eq!(&data[CONTRIBUTION_BOUNTY_OFFSET..CONTRIBUTION_BOUNTY_OFFSET + 32], &[8u8; 32]);
    // A refunded flag that is neither 0 nor 1 isn't a contribution.
    data[3] = 2;
    assert_eq!(Contribution::unpack(&data), Err(EscrowError::InvalidData));
}

#[test]
fn accounts_refuse_the_wrong_size_kind_or_state() {
    let b = opened();
    let mut data = vec![0u8; Bounty::LEN];
    b.pack(&mut data).unwrap();
    assert_eq!(b.pack(&mut [0u8; 10]), Err(EscrowError::InvalidData));
    assert_eq!(Bounty::unpack(&data[..Bounty::LEN - 1]), Err(EscrowError::InvalidData));
    // A bounty isn't a contribution, and a contribution isn't a bounty.
    assert_eq!(Contribution::unpack(&data), Err(EscrowError::InvalidData));
    let c = Contribution { bump: 1, refunded: false, bounty: [8; 32], funder: [1; 32], amount: 5 };
    let mut cdata = vec![0u8; Contribution::LEN];
    c.pack(&mut cdata).unwrap();
    assert_eq!(Bounty::unpack(&cdata), Err(EscrowError::InvalidData));
    // A state byte that isn't one.
    let mut bad = data.clone();
    bad[2] = 9;
    assert_eq!(Bounty::unpack(&bad), Err(EscrowError::InvalidData));
    // An Option flag of 0 with a value behind it is a forgery, not None.
    let claimant_at = Bounty::LEN - (8 + 8 + 32 + 20 + 8 + 9 + 33);
    let mut forged = data.clone();
    forged[claimant_at + 1] = 4;
    assert_eq!(Bounty::unpack(&forged), Err(EscrowError::InvalidData));
    // Trailing bytes are a different layout.
    let mut longer = cdata.clone();
    longer.push(0);
    assert_eq!(Contribution::unpack(&longer), Err(EscrowError::InvalidData));
}

#[test]
fn instructions_round_trip_and_refuse_unknown_tags_or_short_data() {
    let all = [
        EscrowInstruction::InitBounty { repo_hash: [7; 32], issue: u64::MAX, nonce: 255, expiry_ts: -1, attester: [2; 32], approver: [3; 32] },
        EscrowInstruction::Fund { amount: 1 },
        EscrowInstruction::Claim { pr_number: 5, claimant_wallet: [4; 32] },
        EscrowInstruction::Release { merge_sha: [0xcd; 20], merged_by_hash: [0xef; 32], pr_number: 5 },
        EscrowInstruction::Refund,
        EscrowInstruction::Cancel,
    ];
    for ix in all {
        let bytes = ix.pack();
        assert!(bytes.len() <= EscrowInstruction::MAX_LEN);
        assert_eq!(EscrowInstruction::unpack(&bytes).unwrap(), ix);
        if bytes.len() > 1 {
            assert_eq!(EscrowInstruction::unpack(&bytes[..bytes.len() - 1]), Err(EscrowError::InvalidData));
        }
    }
    assert_eq!(EscrowInstruction::unpack(&[]), Err(EscrowError::InvalidInstruction));
    assert_eq!(EscrowInstruction::unpack(&[42]), Err(EscrowError::InvalidInstruction));
    assert_eq!(EscrowInstruction::unpack(&[TAG_FUND, 1, 2]), Err(EscrowError::InvalidData));
    // A refund with trailing bytes isn't a refund.
    assert_eq!(EscrowInstruction::unpack(&[4, 0]), Err(EscrowError::InvalidData));
}

#[test]
fn events_start_with_their_one_byte_discriminator() {
    let e = EscrowEvent::Released { bounty: [8; 32], claimant_wallet: [4; 32], amount: 1, pr_number: 2, merge_sha: [3; 20], merged_by_hash: [5; 32], attester: [2; 32], approver: [3; 32] };
    let bytes = e.pack();
    assert_eq!(bytes[0], EVENT_RELEASED);
    assert_eq!(bytes.len(), 1 + 32 + 32 + 8 + 8 + 20 + 32 * 3);
    assert_eq!(EscrowEvent::Refunded { bounty: [8; 32], funder: [1; 32], amount: 1, remaining: 0 }.pack().len(), 1 + 32 + 32 + 8 + 2);
}

#[test]
fn a_released_bounty_records_who_was_paid_for_which_merge() {
    let mut b = opened();
    machine::fund(&mut b, None, &[1; 32], 50, 250, &[8; 32], 1100).unwrap();
    machine::claim(&mut b, &[2; 32], 77, &[4; 32], 1200).unwrap();
    let a = ReleaseArgs { attester: [2; 32], approver: [3; 32], pr_number: 77, merge_sha: [0xab; 20], merged_by_hash: [0xcd; 32], vault_balance: 50 };
    assert_eq!(machine::release(&mut b, &a, 1500), Ok(50));
    assert_eq!((b.state, b.claimant_wallet, b.pr_number, b.merge_sha, b.merged_by_hash, b.settled_at), (BountyState::Released, Some([4; 32]), Some(77), [0xab; 20], [0xcd; 32], 1500));
    assert!(b.state.settled());
}

#[test]
fn the_allowlist_is_devnet_usdc_and_the_test_mint_only_in_test_builds() {
    assert!(mint_allowed(&DEVNET_USDC_MINT));
    assert!(!mint_allowed(&[9; 32]));
    assert_eq!(mint_allowed(&TEST_MINT), cfg!(feature = "test-mint"));
}

#[test]
fn error_codes_are_unique_and_start_at_6000() {
    let mut codes: Vec<u32> = EscrowError::ALL.iter().map(|e| e.code()).collect();
    codes.sort();
    codes.dedup();
    assert_eq!(codes.len(), EscrowError::ALL.len());
    assert_eq!(codes[0], 6000);
    assert_eq!(*codes.last().unwrap(), 6000 + EscrowError::ALL.len() as u32 - 1);
}

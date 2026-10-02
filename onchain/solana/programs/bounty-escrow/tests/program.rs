//! The program's instructions end to end on the host harness (see harness/mod.rs): accounts made,
//! tokens moved, events logged, and every account check that keeps someone from paying themselves.
//! The SDK's litesvm tests run the same flows against the built .so.

mod harness;

use bounty_escrow::cpi::{ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID};
use bounty_escrow_core::event::{EVENT_BOUNTY_CREATED, EVENT_CANCELLED, EVENT_CLAIMED, EVENT_FUNDED, EVENT_REFUNDED, EVENT_RELEASED};
use bounty_escrow_core::instruction::EscrowInstruction;
use bounty_escrow_core::state::{Bounty, BountyState, Contribution};
use bounty_escrow_core::{EscrowError, BOUNTY_SEED, CONTRIB_SEED, DEVNET_USDC_MINT, TEST_MINT};
use harness::{key, readonly, signer, writable, Account, Ledger, Meta};
use solana_program::hash::hash;
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

const USDC: u64 = 1_000_000;
const TOKEN_2022: Pubkey = solana_program::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PB9BkTMQ4wg9ep");

struct Office {
    l: Ledger,
    payer: Pubkey,
    attester: Pubkey,
    approver: Pubkey,
    funders: [Pubkey; 2],
    agent: Pubkey,
    mint: Pubkey,
    repo_hash: [u8; 32],
    issue: u64,
    nonce: u8,
}

fn err(e: EscrowError) -> ProgramError {
    ProgramError::Custom(e.code())
}

fn sign_as(k: Pubkey) -> Meta {
    Meta(k, true, false)
}

impl Office {
    /// Two funders holding 1000 test USDC each, an agent operator with no token account yet.
    fn new() -> Self {
        let mut l = Ledger::new(Pubkey::new_from_array([0x11; 32]));
        let (payer, attester, approver, agent) = (key(7), key(2), key(3), key(4));
        let funders = [key(1), key(6)];
        for w in [payer, attester, approver, agent, funders[0], funders[1]] {
            l.wallet(w);
        }
        let mint = Pubkey::new_from_array(TEST_MINT);
        l.mint(mint, 6);
        for f in funders {
            l.token_account(Ledger::ata(&f, &mint), mint, f, 1000 * USDC);
        }
        Office { l, payer, attester, approver, funders, agent, mint, repo_hash: hash(b"webdevcody/agent-office").to_bytes(), issue: 12, nonce: 0 }
    }

    fn bounty_key(&self) -> Pubkey {
        Pubkey::find_program_address(&[BOUNTY_SEED, &self.repo_hash, &self.issue.to_le_bytes(), &[self.nonce]], &self.l.program_id).0
    }

    fn vault(&self) -> Pubkey {
        Ledger::ata(&self.bounty_key(), &self.mint)
    }

    fn contribution_key(&self, funder: Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[CONTRIB_SEED, self.bounty_key().as_ref(), funder.as_ref()], &self.l.program_id).0
    }

    fn init_with(&mut self, mint: Pubkey, token: Pubkey, attester: Pubkey, approver: Pubkey, expiry_ts: i64) -> Result<(), ProgramError> {
        let ix = EscrowInstruction::InitBounty { repo_hash: self.repo_hash, issue: self.issue, nonce: self.nonce, expiry_ts, attester: attester.to_bytes(), approver: approver.to_bytes() }.pack();
        let bounty = self.bounty_key();
        let vault = Ledger::ata(&bounty, &mint);
        let metas = [signer(self.payer), writable(bounty), writable(vault), readonly(mint), readonly(SYSTEM_PROGRAM_ID), readonly(token), readonly(ASSOCIATED_TOKEN_PROGRAM_ID)];
        self.l.run(&metas, &ix).0
    }

    fn init(&mut self) -> Result<(), ProgramError> {
        let (mint, attester, approver) = (self.mint, self.attester, self.approver);
        self.init_with(mint, TOKEN_PROGRAM_ID, attester, approver, 5000)
    }

    fn fund(&mut self, funder: Pubkey, amount: u64) -> (Result<(), ProgramError>, Vec<Vec<u8>>) {
        let metas = [
            signer(funder),
            writable(self.bounty_key()),
            writable(self.vault()),
            writable(self.contribution_key(funder)),
            writable(Ledger::ata(&funder, &self.mint)),
            readonly(self.mint),
            readonly(TOKEN_PROGRAM_ID),
            readonly(SYSTEM_PROGRAM_ID),
        ];
        self.l.run(&metas, &EscrowInstruction::Fund { amount }.pack())
    }

    fn claim(&mut self, by: Pubkey, pr_number: u64, wallet: Pubkey) -> Result<(), ProgramError> {
        let metas = [sign_as(by), writable(self.bounty_key())];
        self.l.run(&metas, &EscrowInstruction::Claim { pr_number, claimant_wallet: wallet.to_bytes() }.pack()).0
    }

    fn release_metas(&self, attester: Meta, approver: Meta, wallet: Pubkey) -> Vec<Meta> {
        vec![
            signer(self.payer),
            attester,
            approver,
            writable(self.bounty_key()),
            writable(self.vault()),
            readonly(wallet),
            writable(Ledger::ata(&wallet, &self.mint)),
            readonly(self.mint),
            readonly(SYSTEM_PROGRAM_ID),
            readonly(TOKEN_PROGRAM_ID),
            readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
        ]
    }

    fn release_ix(pr_number: u64) -> Vec<u8> {
        EscrowInstruction::Release { merge_sha: [0xab; 20], merged_by_hash: [0xcd; 32], pr_number }.pack()
    }

    fn release(&mut self, pr_number: u64) -> (Result<(), ProgramError>, Vec<Vec<u8>>) {
        let metas = self.release_metas(sign_as(self.attester), sign_as(self.approver), self.agent);
        self.l.run(&metas, &Self::release_ix(pr_number))
    }

    fn refund_to(&mut self, funder: Pubkey, to: Pubkey) -> (Result<(), ProgramError>, Vec<Vec<u8>>) {
        let metas = [writable(self.bounty_key()), writable(self.vault()), writable(self.contribution_key(funder)), writable(to), readonly(self.mint), readonly(TOKEN_PROGRAM_ID)];
        self.l.run(&metas, &EscrowInstruction::Refund.pack())
    }

    fn refund(&mut self, funder: Pubkey) -> (Result<(), ProgramError>, Vec<Vec<u8>>) {
        let to = Ledger::ata(&funder, &self.mint);
        self.refund_to(funder, to)
    }

    fn cancel(&mut self, approver: Option<Pubkey>) -> (Result<(), ProgramError>, Vec<Vec<u8>>) {
        let mut metas = vec![writable(self.bounty_key()), writable(self.vault()), writable(self.payer), readonly(TOKEN_PROGRAM_ID)];
        if let Some(a) = approver {
            metas.push(sign_as(a));
        }
        self.l.run(&metas, &EscrowInstruction::Cancel.pack())
    }

    fn bounty(&self) -> Bounty {
        Bounty::unpack(&self.l.get(&self.bounty_key()).data).unwrap()
    }

    fn contribution(&self, funder: Pubkey) -> Contribution {
        Contribution::unpack(&self.l.get(&self.contribution_key(funder)).data).unwrap()
    }

    fn funded() -> Self {
        let mut o = Office::new();
        o.init().unwrap();
        let [a, b] = o.funders;
        o.fund(a, 30 * USDC).0.unwrap();
        o.fund(b, 20 * USDC).0.unwrap();
        o
    }

    fn claimed() -> Self {
        let mut o = Office::funded();
        let agent = o.agent;
        o.claim(o.attester, 77, agent).unwrap();
        o
    }
}

fn tags(logs: &[Vec<u8>]) -> Vec<u8> {
    logs.iter().map(|e| e[0]).collect()
}

#[test]
fn a_bounty_is_opened_funded_claimed_and_paid_once_both_sign() {
    let mut o = Office::new();
    let (r, logs) = {
        let ix = EscrowInstruction::InitBounty { repo_hash: o.repo_hash, issue: 12, nonce: 0, expiry_ts: 5000, attester: o.attester.to_bytes(), approver: o.approver.to_bytes() }.pack();
        let metas = [signer(o.payer), writable(o.bounty_key()), writable(o.vault()), readonly(o.mint), readonly(SYSTEM_PROGRAM_ID), readonly(TOKEN_PROGRAM_ID), readonly(ASSOCIATED_TOKEN_PROGRAM_ID)];
        o.l.run(&metas, &ix)
    };
    r.unwrap();
    assert_eq!(tags(&logs), [EVENT_BOUNTY_CREATED]);
    let b = o.bounty();
    assert_eq!((b.state, b.total, b.vault, b.creator, b.mint), (BountyState::Open, 0, o.vault().to_bytes(), o.payer.to_bytes(), TEST_MINT));

    let [f1, f2] = o.funders;
    let (r, logs) = o.fund(f1, 30 * USDC);
    r.unwrap();
    assert_eq!(tags(&logs), [EVENT_FUNDED]);
    o.fund(f2, 20 * USDC).0.unwrap();
    o.fund(f1, 5 * USDC).0.unwrap();
    assert_eq!((o.bounty().total, o.bounty().funder_count), (55 * USDC, 2));
    assert_eq!(o.contribution(f1).amount, 35 * USDC);
    assert_eq!(o.l.balance(&o.vault()), 55 * USDC);

    let agent = o.agent;
    o.claim(o.attester, 77, agent).unwrap();
    assert_eq!(o.bounty().state, BountyState::Claimed);

    let (r, logs) = o.release(77);
    r.unwrap();
    assert_eq!(tags(&logs), [EVENT_RELEASED]);
    // The agent operator never held the token: their account was made, paid by the payer.
    assert_eq!(o.l.balance(&Ledger::ata(&agent, &o.mint)), 55 * USDC);
    assert_eq!(o.l.balance(&o.vault()), 0);
    let b = o.bounty();
    assert_eq!((b.state, b.paid, b.pr_number, b.merge_sha, b.merged_by_hash), (BountyState::Released, 55 * USDC, Some(77), [0xab; 20], [0xcd; 32]));
    // Once.
    assert_eq!(o.release(77).0, Err(err(EscrowError::WrongState)));
}

#[test]
fn a_release_needs_the_attester_and_the_approver_to_sign() {
    let mut o = Office::claimed();
    let agent = o.agent;
    // The approver's account is passed but doesn't sign.
    let metas = o.release_metas(sign_as(o.attester), readonly(o.approver), agent);
    assert_eq!(o.l.run(&metas, &Office::release_ix(77)).0, Err(ProgramError::MissingRequiredSignature));
    // The attester's doesn't sign.
    let metas = o.release_metas(readonly(o.attester), sign_as(o.approver), agent);
    assert_eq!(o.l.run(&metas, &Office::release_ix(77)).0, Err(ProgramError::MissingRequiredSignature));
    // Someone else signs as the approver, or the two swap places.
    let metas = o.release_metas(sign_as(o.attester), sign_as(key(5)), agent);
    assert_eq!(o.l.run(&metas, &Office::release_ix(77)).0, Err(err(EscrowError::Unauthorized)));
    let metas = o.release_metas(sign_as(o.approver), sign_as(o.attester), agent);
    assert_eq!(o.l.run(&metas, &Office::release_ix(77)).0, Err(err(EscrowError::Unauthorized)));
    assert_eq!(o.bounty().state, BountyState::Claimed);
    o.release(77).0.unwrap();
}

#[test]
fn a_release_pays_only_the_claimed_pr_and_wallet() {
    let mut o = Office::claimed();
    assert_eq!(o.release(78).0, Err(err(EscrowError::PullRequestMismatch)));
    // Handing in another wallet than the one claimed is refused before anything moves.
    let metas = o.release_metas(sign_as(o.attester), sign_as(o.approver), key(5));
    assert_eq!(o.l.run(&metas, &Office::release_ix(77)).0, Err(err(EscrowError::WrongAccount)));
    // A token account that isn't the claimed wallet's associated one: the ATA program refuses it.
    let mut metas = o.release_metas(sign_as(o.attester), sign_as(o.approver), o.agent);
    metas[6] = writable(Ledger::ata(&o.funders[0], &o.mint));
    assert!(o.l.run(&metas, &Office::release_ix(77)).0.is_err());
    assert_eq!(o.l.balance(&o.vault()), 50 * USDC);
}

#[test]
fn only_the_attester_claims_and_it_can_rebind_until_released() {
    let mut o = Office::funded();
    let agent = o.agent;
    assert_eq!(o.claim(o.approver, 77, agent), Err(err(EscrowError::Unauthorized)));
    assert_eq!(o.claim(o.funders[0], 77, agent), Err(err(EscrowError::Unauthorized)));
    assert_eq!(o.claim(o.attester, 77, Pubkey::default()), Err(err(EscrowError::InvalidRecipient)));
    o.claim(o.attester, 77, key(5)).unwrap();
    let (r, logs) = {
        let metas = [sign_as(o.attester), writable(o.bounty_key())];
        o.l.run(&metas, &EscrowInstruction::Claim { pr_number: 80, claimant_wallet: agent.to_bytes() }.pack())
    };
    r.unwrap();
    assert_eq!(tags(&logs), [EVENT_CLAIMED]);
    assert_eq!((o.bounty().pr_number, o.bounty().claimant_wallet), (Some(80), Some(agent.to_bytes())));
    o.release(80).0.unwrap();
    assert_eq!(o.claim(o.attester, 81, agent), Err(err(EscrowError::WrongState)));
}

#[test]
fn only_allowed_mints_of_the_classic_token_program_open_a_bounty() {
    let mut o = Office::new();
    let (attester, approver) = (o.attester, o.approver);
    let other = key(9);
    o.l.mint(other, 6);
    assert_eq!(o.init_with(other, TOKEN_PROGRAM_ID, attester, approver, 5000), Err(err(EscrowError::MintNotAllowed)));
    assert_eq!(o.init_with(o.mint, TOKEN_2022, attester, approver, 5000), Err(err(EscrowError::WrongTokenProgram)));
    assert_eq!(o.init_with(o.mint, TOKEN_PROGRAM_ID, attester, attester, 5000), Err(err(EscrowError::SameAuthority)));
    assert_eq!(o.init_with(o.mint, TOKEN_PROGRAM_ID, attester, approver, 1000), Err(err(EscrowError::InvalidExpiry)));
    // Devnet USDC is allowed in every build.
    let usdc = Pubkey::new_from_array(DEVNET_USDC_MINT);
    o.l.mint(usdc, 6);
    o.init_with(usdc, TOKEN_PROGRAM_ID, attester, approver, 5000).unwrap();
    assert_eq!(o.init_with(usdc, TOKEN_PROGRAM_ID, attester, approver, 5000), Err(err(EscrowError::AlreadyInitialized)));
}

#[test]
fn a_mint_that_isnt_a_token_programs_is_refused() {
    let mut o = Office::new();
    let (attester, approver, mint) = (o.attester, o.approver, o.mint);
    let mut fake = o.l.get(&mint);
    fake.owner = key(42);
    o.l.put(mint, fake);
    assert_eq!(o.init_with(mint, TOKEN_PROGRAM_ID, attester, approver, 5000), Err(ProgramError::IncorrectProgramId));
}

#[test]
fn nobody_blocks_a_bounty_by_making_its_vault_or_sending_lamports_first() {
    let mut o = Office::new();
    let (bounty, vault, mint) = (o.bounty_key(), o.vault(), o.mint);
    o.l.token_account(vault, mint, bounty, 0);
    o.l.put(bounty, Account { lamports: 5, data: vec![], owner: SYSTEM_PROGRAM_ID });
    o.init().unwrap();
    assert_eq!(o.bounty().state, BountyState::Open);
}

#[test]
fn every_funder_cranks_back_their_own_contribution_after_expiry() {
    let mut o = Office::claimed();
    let [f1, f2] = o.funders;
    assert_eq!(o.refund(f1).0, Err(err(EscrowError::NotExpired)));
    o.l.now = 5001;
    // Back to the funder's own token account only, whoever cranks it.
    let elsewhere = Ledger::ata(&f2, &o.mint);
    assert_eq!(o.refund_to(f1, elsewhere).0, Err(err(EscrowError::WrongAccount)));
    let (r, logs) = o.refund(f1);
    r.unwrap();
    assert_eq!(tags(&logs), [EVENT_REFUNDED]);
    assert_eq!(o.l.balance(&Ledger::ata(&f1, &o.mint)), 1000 * USDC);
    assert!(o.contribution(f1).refunded);
    assert_eq!(o.bounty().state, BountyState::Claimed);
    assert_eq!(o.refund(f1).0, Err(err(EscrowError::AlreadyRefunded)));
    o.refund(f2).0.unwrap();
    assert_eq!(o.l.balance(&Ledger::ata(&f2, &o.mint)), 1000 * USDC);
    assert_eq!(o.bounty().state, BountyState::Refunded);
    // Nothing is released from a refunded bounty, even signed by both.
    assert_eq!(o.release(77).0, Err(err(EscrowError::WrongState)));
}

#[test]
fn a_contribution_to_another_bounty_cant_be_refunded_from_this_one() {
    let mut o = Office::funded();
    let first = o.bounty_key();
    let first_vault = o.vault();
    o.nonce = 1;
    o.init().unwrap();
    let f1 = o.funders[0];
    o.fund(f1, USDC).0.unwrap();
    o.l.now = 5001;
    // The second bounty's contribution, against the first bounty's vault.
    let metas = [writable(first), writable(first_vault), writable(o.contribution_key(f1)), writable(Ledger::ata(&f1, &o.mint)), readonly(o.mint), readonly(TOKEN_PROGRAM_ID)];
    assert_eq!(o.l.run(&metas, &EscrowInstruction::Refund.pack()).0, Err(err(EscrowError::WrongAccount)));
}

#[test]
fn tokens_sent_straight_to_the_vault_are_paid_out_with_the_bounty() {
    let mut o = Office::claimed();
    let (vault, mint, bounty) = (o.vault(), o.mint, o.bounty_key());
    o.l.token_account(vault, mint, bounty, 51 * USDC);
    o.release(77).0.unwrap();
    assert_eq!(o.l.balance(&Ledger::ata(&o.agent, &o.mint)), 51 * USDC);
}

#[test]
fn an_empty_bounty_cancels_and_its_rent_goes_back_to_its_creator() {
    let mut o = Office::new();
    o.init().unwrap();
    let before = o.l.get(&o.payer).lamports;
    let (r, logs) = o.cancel(None);
    r.unwrap();
    assert_eq!(tags(&logs), [EVENT_CANCELLED]);
    assert!(o.l.get(&o.payer).lamports > before);
    assert_eq!(o.l.get(&o.bounty_key()).lamports, 0);
    assert_eq!(o.l.get(&o.bounty_key()).owner, SYSTEM_PROGRAM_ID);
}

#[test]
fn a_funded_bounty_cancels_only_by_the_approver_before_a_claim() {
    let mut o = Office::funded();
    assert_eq!(o.cancel(None).0, Err(err(EscrowError::Unauthorized)));
    assert_eq!(o.cancel(Some(o.attester)).0, Err(err(EscrowError::Unauthorized)));
    o.cancel(Some(o.approver)).0.unwrap();
    assert_eq!(o.bounty().state, BountyState::Cancelled);
    // The crank opens at once, before the expiry.
    let [f1, f2] = o.funders;
    o.refund(f1).0.unwrap();
    o.refund(f2).0.unwrap();
    assert_eq!(o.l.balance(&o.vault()), 0);
    let mut c = Office::claimed();
    assert_eq!(c.cancel(Some(c.approver)).0, Err(err(EscrowError::WrongState)));
}

#[test]
fn funding_after_the_expiry_or_with_nothing_is_refused() {
    let mut o = Office::new();
    o.init().unwrap();
    let f1 = o.funders[0];
    assert_eq!(o.fund(f1, 0).0, Err(err(EscrowError::InvalidAmount)));
    o.l.now = 5001;
    assert_eq!(o.fund(f1, USDC).0, Err(err(EscrowError::Expired)));
}

#[test]
fn bad_instruction_data_is_refused() {
    let mut o = Office::funded();
    let metas = [sign_as(o.attester), writable(o.bounty_key())];
    assert_eq!(o.l.run(&metas, &[]).0, Err(err(EscrowError::InvalidInstruction)));
    assert_eq!(o.l.run(&metas, &[99]).0, Err(err(EscrowError::InvalidInstruction)));
    assert_eq!(o.l.run(&metas, &[2, 1]).0, Err(err(EscrowError::InvalidData)));
}

#[test]
fn a_bounty_owned_by_another_program_is_not_read_as_one() {
    let mut o = Office::claimed();
    let bounty = o.bounty_key();
    let mut forged = o.l.get(&bounty);
    forged.owner = key(42);
    o.l.put(bounty, forged);
    assert_eq!(o.release(77).0, Err(err(EscrowError::WrongAccount)));
}

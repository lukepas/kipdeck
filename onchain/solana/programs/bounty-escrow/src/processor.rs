//! Reads and checks each instruction's accounts, asks the state machine whether the step is
//! allowed, moves the tokens, saves the accounts and logs the event. Account order per instruction
//! is documented on `EscrowInstruction`.
//!
//! Every account is checked before it is trusted: signers signed, program accounts are owned by
//! this program and sit at the address their seeds and recorded bump give, token accounts belong to
//! the classic SPL Token program and hold the bounty's mint, and the programs passed in are the
//! ones expected.

use crate::cpi::{self, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID};
use bounty_escrow_core::event::EscrowEvent;
use bounty_escrow_core::instruction::EscrowInstruction;
use bounty_escrow_core::machine::{self, Cancel, InitArgs, ReleaseArgs};
use bounty_escrow_core::state::{Bounty, Contribution};
use bounty_escrow_core::{EscrowError, Key, BOUNTY_SEED, CONTRIB_SEED, NO_KEY};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    log::sol_log_data,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

fn fail(e: EscrowError) -> ProgramError {
    msg!("bounty-escrow: {}", e.name());
    ProgramError::Custom(e.code())
}

fn emit(e: EscrowEvent) {
    sol_log_data(&[&e.pack()]);
}

fn key(info: &AccountInfo) -> Key {
    info.key.to_bytes()
}

fn signer(info: &AccountInfo) -> Result<Key, ProgramError> {
    if info.is_signer {
        Ok(key(info))
    } else {
        Err(ProgramError::MissingRequiredSignature)
    }
}

fn expect(info: &AccountInfo, want: &Pubkey) -> ProgramResult {
    if info.key == want {
        Ok(())
    } else {
        Err(fail(EscrowError::WrongAccount))
    }
}

fn expect_key(info: &AccountInfo, want: &Key) -> ProgramResult {
    expect(info, &Pubkey::new_from_array(*want))
}

fn writable(info: &AccountInfo) -> ProgramResult {
    if info.is_writable {
        Ok(())
    } else {
        Err(ProgramError::InvalidArgument)
    }
}

/// The classic SPL Token program and no other (Token-2022 mints are refused).
fn token_program(info: &AccountInfo) -> ProgramResult {
    if info.key == &TOKEN_PROGRAM_ID {
        Ok(())
    } else {
        Err(fail(EscrowError::WrongTokenProgram))
    }
}

fn now() -> Result<i64, ProgramError> {
    Ok(Clock::get()?.unix_timestamp)
}

fn bounty_seeds<'a>(b: &'a Bounty, issue_le: &'a [u8; 8], nonce: &'a [u8; 1], bump: &'a [u8; 1]) -> [&'a [u8]; 7] {
    [BOUNTY_SEED, &b.repo_hash, issue_le, nonce, &b.attester, &b.approver, bump]
}

/// A bounty account of this program's, at the address its seeds and bump give.
fn load_bounty(program_id: &Pubkey, info: &AccountInfo) -> Result<Bounty, ProgramError> {
    if info.owner != program_id {
        return Err(fail(EscrowError::WrongAccount));
    }
    let b = Bounty::unpack(&info.try_borrow_data()?).map_err(fail)?;
    let at = Pubkey::create_program_address(&[BOUNTY_SEED, &b.repo_hash, &b.issue.to_le_bytes(), &[b.nonce], &b.attester, &b.approver, &[b.bump]], program_id).map_err(|_| fail(EscrowError::WrongAccount))?;
    expect(info, &at)?;
    Ok(b)
}

fn save_bounty(info: &AccountInfo, b: &Bounty) -> ProgramResult {
    b.pack(&mut info.try_borrow_mut_data()?).map_err(fail)
}

/// The bounty's vault: the address it recorded, a token account of its mint that the bounty owns.
/// Returns what it holds.
fn load_vault(info: &AccountInfo, bounty_info: &AccountInfo, b: &Bounty) -> Result<u64, ProgramError> {
    expect_key(info, &b.vault)?;
    let v = cpi::token_account(info)?;
    if v.mint.to_bytes() != b.mint {
        return Err(fail(EscrowError::WrongMint));
    }
    if v.owner != *bounty_info.key {
        return Err(fail(EscrowError::WrongAccount));
    }
    Ok(v.amount)
}

/// A contribution account of this program's for this bounty, re-derived from its seeds.
fn load_contribution(program_id: &Pubkey, info: &AccountInfo, bounty_info: &AccountInfo) -> Result<Contribution, ProgramError> {
    if info.owner != program_id {
        return Err(fail(EscrowError::WrongAccount));
    }
    let c = Contribution::unpack(&info.try_borrow_data()?).map_err(fail)?;
    if c.bounty != key(bounty_info) {
        return Err(fail(EscrowError::WrongAccount));
    }
    let at = Pubkey::create_program_address(&[CONTRIB_SEED, &c.bounty, &c.funder, &[c.bump]], program_id).map_err(|_| fail(EscrowError::WrongAccount))?;
    expect(info, &at)?;
    Ok(c)
}

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    match EscrowInstruction::unpack(data).map_err(fail)? {
        EscrowInstruction::InitBounty { repo_hash, issue, nonce, expiry_ts, attester, approver } => init_bounty(program_id, accounts, repo_hash, issue, nonce, expiry_ts, attester, approver),
        EscrowInstruction::Fund { amount } => fund(program_id, accounts, amount),
        EscrowInstruction::Claim { pr_number, claimant_wallet } => claim(program_id, accounts, pr_number, claimant_wallet),
        EscrowInstruction::Release { merge_sha, merged_by_hash, pr_number } => release(program_id, accounts, merge_sha, merged_by_hash, pr_number),
        EscrowInstruction::Refund => refund(program_id, accounts),
        EscrowInstruction::Cancel => cancel(program_id, accounts),
    }
}

#[allow(clippy::too_many_arguments)]
fn init_bounty(program_id: &Pubkey, accounts: &[AccountInfo], repo_hash: Key, issue: u64, nonce: u8, expiry_ts: i64, attester: Key, approver: Key) -> ProgramResult {
    let it = &mut accounts.iter();
    let payer = next_account_info(it)?;
    let bounty_info = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let system = next_account_info(it)?;
    let token = next_account_info(it)?;
    let ata_program = next_account_info(it)?;
    let creator = signer(payer)?;
    writable(payer)?;
    writable(bounty_info)?;
    writable(vault)?;
    expect(system, &SYSTEM_PROGRAM_ID)?;
    token_program(token)?;
    expect(ata_program, &ASSOCIATED_TOKEN_PROGRAM_ID)?;
    cpi::mint_decimals(mint)?;
    let issue_le = issue.to_le_bytes();
    // The attester and the approver are in the seeds: a bounty opened with other keys sits elsewhere.
    let (bounty_at, bump) = Pubkey::find_program_address(&[BOUNTY_SEED, &repo_hash, &issue_le, &[nonce], &attester, &approver], program_id);
    expect(bounty_info, &bounty_at)?;
    if !bounty_info.data_is_empty() || bounty_info.owner == program_id {
        return Err(fail(EscrowError::AlreadyInitialized));
    }
    let vault_at = cpi::associated_token_address(&bounty_at, mint.key);
    expect(vault, &vault_at)?;
    let bounty = machine::init(InitArgs { repo_hash, issue, nonce, mint: key(mint), vault: vault_at.to_bytes(), expiry_ts, attester, approver, creator, bump }, now()?).map_err(fail)?;
    cpi::create_pda(payer, bounty_info, system, Bounty::LEN, program_id, &[BOUNTY_SEED, &repo_hash, &issue_le, &[nonce], &attester, &approver, &[bump]], &Rent::get()?)?;
    cpi::create_ata_idempotent(payer, vault, bounty_info, mint, system, token, ata_program)?;
    // Whoever made the vault, it must be the bounty's own token account for this mint.
    load_vault(vault, bounty_info, &bounty)?;
    save_bounty(bounty_info, &bounty)?;
    emit(EscrowEvent::BountyCreated { bounty: bounty_at.to_bytes(), repo_hash, issue, nonce, mint: bounty.mint, attester, approver, creator, expiry_ts });
    Ok(())
}

fn fund(program_id: &Pubkey, accounts: &[AccountInfo], amount: u64) -> ProgramResult {
    let it = &mut accounts.iter();
    let funder = next_account_info(it)?;
    let bounty_info = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let contribution_info = next_account_info(it)?;
    let from = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let token = next_account_info(it)?;
    let system = next_account_info(it)?;
    let funder_key = signer(funder)?;
    for w in [funder, bounty_info, vault, contribution_info, from] {
        writable(w)?;
    }
    token_program(token)?;
    expect(system, &SYSTEM_PROGRAM_ID)?;
    let mut bounty = load_bounty(program_id, bounty_info)?;
    expect_key(mint, &bounty.mint)?;
    load_vault(vault, bounty_info, &bounty)?;
    let bounty_key = key(bounty_info);
    let (contribution_at, bump) = Pubkey::find_program_address(&[CONTRIB_SEED, &bounty_key, &funder_key], program_id);
    expect(contribution_info, &contribution_at)?;
    let existing = if contribution_info.owner == program_id && !contribution_info.data_is_empty() { Some(load_contribution(program_id, contribution_info, bounty_info)?) } else { None };
    let is_new = existing.is_none();
    let contribution = machine::fund(&mut bounty, existing, &funder_key, amount, bump, &bounty_key, now()?).map_err(fail)?;
    if cpi::token_account(from)?.mint.to_bytes() != bounty.mint {
        return Err(fail(EscrowError::WrongMint));
    }
    if is_new {
        cpi::create_pda(funder, contribution_info, system, Contribution::LEN, program_id, &[CONTRIB_SEED, &bounty_key, &funder_key, &[bump]], &Rent::get()?)?;
    }
    cpi::transfer(from, mint, vault, funder, token, amount, cpi::mint_decimals(mint)?, &[])?;
    contribution.pack(&mut contribution_info.try_borrow_mut_data()?).map_err(fail)?;
    save_bounty(bounty_info, &bounty)?;
    emit(EscrowEvent::Funded { bounty: bounty_key, funder: funder_key, amount, contribution: contribution.amount, total: bounty.total });
    Ok(())
}

fn claim(program_id: &Pubkey, accounts: &[AccountInfo], pr_number: u64, claimant_wallet: Key) -> ProgramResult {
    let it = &mut accounts.iter();
    let attester = next_account_info(it)?;
    let bounty_info = next_account_info(it)?;
    let attester_key = signer(attester)?;
    writable(bounty_info)?;
    let mut bounty = load_bounty(program_id, bounty_info)?;
    machine::claim(&mut bounty, &attester_key, pr_number, &claimant_wallet, now()?).map_err(fail)?;
    save_bounty(bounty_info, &bounty)?;
    emit(EscrowEvent::Claimed { bounty: key(bounty_info), pr_number, claimant_wallet });
    Ok(())
}

fn release(program_id: &Pubkey, accounts: &[AccountInfo], merge_sha: [u8; 20], merged_by_hash: Key, pr_number: u64) -> ProgramResult {
    let it = &mut accounts.iter();
    let payer = next_account_info(it)?;
    let attester = next_account_info(it)?;
    let approver = next_account_info(it)?;
    let bounty_info = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let claimant = next_account_info(it)?;
    let to = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let system = next_account_info(it)?;
    let token = next_account_info(it)?;
    let ata_program = next_account_info(it)?;
    signer(payer)?;
    // Both must sign: the attester (GitHub says a person with write access merged this office PR)
    // and the approver (an office admin approved the payout).
    let attester_key = signer(attester)?;
    let approver_key = signer(approver)?;
    for w in [payer, bounty_info, vault, to] {
        writable(w)?;
    }
    expect(system, &SYSTEM_PROGRAM_ID)?;
    token_program(token)?;
    expect(ata_program, &ASSOCIATED_TOKEN_PROGRAM_ID)?;
    let mut bounty = load_bounty(program_id, bounty_info)?;
    expect_key(mint, &bounty.mint)?;
    let held = load_vault(vault, bounty_info, &bounty)?;
    let paid = machine::release(&mut bounty, &ReleaseArgs { attester: attester_key, approver: approver_key, pr_number, merge_sha, merged_by_hash, vault_balance: held }, now()?).map_err(fail)?;
    let wallet = bounty.claimant_wallet.ok_or_else(|| fail(EscrowError::InvalidRecipient))?;
    expect_key(claimant, &wallet)?;
    // The claimant may never have held the token: its account is made first, the payer covering rent.
    cpi::create_ata_idempotent(payer, to, claimant, mint, system, token, ata_program)?;
    let dest = cpi::token_account(to)?;
    if dest.mint.to_bytes() != bounty.mint {
        return Err(fail(EscrowError::WrongMint));
    }
    if dest.owner.to_bytes() != wallet {
        return Err(fail(EscrowError::WrongAccount));
    }
    let (issue_le, nonce, bump) = (bounty.issue.to_le_bytes(), [bounty.nonce], [bounty.bump]);
    let seeds = bounty_seeds(&bounty, &issue_le, &nonce, &bump);
    cpi::transfer(vault, mint, to, bounty_info, token, paid, cpi::mint_decimals(mint)?, &seeds)?;
    save_bounty(bounty_info, &bounty)?;
    emit(EscrowEvent::Released { bounty: key(bounty_info), claimant_wallet: wallet, amount: paid, pr_number, merge_sha, merged_by_hash, attester: attester_key, approver: approver_key });
    Ok(())
}

fn refund(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let bounty_info = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let contribution_info = next_account_info(it)?;
    let to = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let token = next_account_info(it)?;
    for w in [bounty_info, vault, contribution_info, to] {
        writable(w)?;
    }
    token_program(token)?;
    let mut bounty = load_bounty(program_id, bounty_info)?;
    expect_key(mint, &bounty.mint)?;
    load_vault(vault, bounty_info, &bounty)?;
    let mut contribution = load_contribution(program_id, contribution_info, bounty_info)?;
    // Back to a token account the funder owns, whoever cranks the refund.
    let back = cpi::token_account(to)?;
    if back.mint.to_bytes() != bounty.mint {
        return Err(fail(EscrowError::WrongMint));
    }
    if back.owner.to_bytes() != contribution.funder {
        return Err(fail(EscrowError::WrongAccount));
    }
    let amount = machine::refund(&mut bounty, &mut contribution, &key(bounty_info), now()?).map_err(fail)?;
    let (issue_le, nonce, bump) = (bounty.issue.to_le_bytes(), [bounty.nonce], [bounty.bump]);
    let seeds = bounty_seeds(&bounty, &issue_le, &nonce, &bump);
    cpi::transfer(vault, mint, to, bounty_info, token, amount, cpi::mint_decimals(mint)?, &seeds)?;
    contribution.pack(&mut contribution_info.try_borrow_mut_data()?).map_err(fail)?;
    save_bounty(bounty_info, &bounty)?;
    let remaining = bounty.funder_count.saturating_sub(bounty.refunded_count);
    emit(EscrowEvent::Refunded { bounty: key(bounty_info), funder: contribution.funder, amount, remaining });
    Ok(())
}

fn cancel(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let bounty_info = next_account_info(it)?;
    let vault = next_account_info(it)?;
    let creator = next_account_info(it)?;
    let token = next_account_info(it)?;
    // The approver is optional: an empty bounty's creator may sign instead.
    let approver_key = match it.next() {
        Some(a) => signer(a)?,
        None => NO_KEY,
    };
    let creator_signed = creator.is_signer;
    for w in [bounty_info, vault, creator] {
        writable(w)?;
    }
    token_program(token)?;
    let mut bounty = load_bounty(program_id, bounty_info)?;
    expect_key(creator, &bounty.creator)?;
    let held = load_vault(vault, bounty_info, &bounty)?;
    let total = bounty.total;
    let bounty_key = key(bounty_info);
    match machine::cancel(&mut bounty, creator_signed, &approver_key, held, now()?).map_err(fail)? {
        Cancel::Close => {
            let (issue_le, nonce, bump) = (bounty.issue.to_le_bytes(), [bounty.nonce], [bounty.bump]);
            let seeds = bounty_seeds(&bounty, &issue_le, &nonce, &bump);
            cpi::close_token_account(vault, creator, bounty_info, token, &seeds)?;
            emit(EscrowEvent::Cancelled { bounty: bounty_key, total, closed: true });
            cpi::close_program_account(bounty_info, creator)
        }
        Cancel::Refunds => {
            save_bounty(bounty_info, &bounty)?;
            emit(EscrowEvent::Cancelled { bounty: bounty_key, total, closed: false });
            Ok(())
        }
    }
}

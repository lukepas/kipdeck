//! The few System, SPL Token and Associated Token instructions the escrow calls, encoded by hand,
//! and the two token layouts it reads. That keeps the program on solana-program alone (no spl-token crate), which is
//! what lets it build with an ordinary cargo.

use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    rent::Rent,
};

pub const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");
/// The original SPL Token program, which devnet USDC uses. Token-2022 mints are refused.
pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/// An SPL token account's size and the offsets the escrow reads.
pub const TOKEN_ACCOUNT_LEN: usize = 165;
const TOKEN_STATE_OFFSET: usize = 108;
/// An SPL mint's size, and where its decimals and initialized flag are.
pub const MINT_LEN: usize = 82;
const MINT_DECIMALS_OFFSET: usize = 44;
const MINT_INITIALIZED_OFFSET: usize = 45;

/// What the escrow needs to know about a token account.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TokenAccount {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

fn key_at(data: &[u8], at: usize) -> Pubkey {
    let mut k = [0u8; 32];
    k.copy_from_slice(&data[at..at + 32]);
    Pubkey::new_from_array(k)
}

/// A token account of the SPL Token program that is initialized (not frozen or empty).
pub fn token_account(info: &AccountInfo) -> Result<TokenAccount, ProgramError> {
    if info.owner != &TOKEN_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = info.try_borrow_data()?;
    // 1 is Initialized; 0 Uninitialized and 2 Frozen can't take or give tokens.
    if data.len() != TOKEN_ACCOUNT_LEN || data[TOKEN_STATE_OFFSET] != 1 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut amount = [0u8; 8];
    amount.copy_from_slice(&data[64..72]);
    Ok(TokenAccount { mint: key_at(&data, 0), owner: key_at(&data, 32), amount: u64::from_le_bytes(amount) })
}

/// An initialized SPL Token mint's decimals.
pub fn mint_decimals(info: &AccountInfo) -> Result<u8, ProgramError> {
    if info.owner != &TOKEN_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = info.try_borrow_data()?;
    if data.len() != MINT_LEN || data[MINT_INITIALIZED_OFFSET] != 1 {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(data[MINT_DECIMALS_OFFSET])
}

fn system_ix(accounts: Vec<AccountMeta>, tag: u32, body: &[u8]) -> Instruction {
    let mut data = tag.to_le_bytes().to_vec();
    data.extend_from_slice(body);
    Instruction { program_id: SYSTEM_PROGRAM_ID, accounts, data }
}

/// Makes `target` (a PDA, signed for by `seeds`) an account of `space` bytes owned by `owner`, paid
/// for by `payer`. Someone may have sent lamports to the address first to make CreateAccount fail;
/// then it's topped up to rent-exempt, allocated and assigned instead.
pub fn create_pda<'a>(payer: &AccountInfo<'a>, target: &AccountInfo<'a>, system: &AccountInfo<'a>, space: usize, owner: &Pubkey, seeds: &[&[u8]], rent: &Rent) -> ProgramResult {
    let needed = rent.minimum_balance(space);
    let have = target.lamports();
    let accounts = [payer.clone(), target.clone(), system.clone()];
    if have == 0 {
        let mut body = needed.to_le_bytes().to_vec();
        body.extend_from_slice(&(space as u64).to_le_bytes());
        body.extend_from_slice(owner.as_ref());
        let ix = system_ix(vec![AccountMeta::new(*payer.key, true), AccountMeta::new(*target.key, true)], 0, &body);
        return invoke_signed(&ix, &accounts, &[seeds]);
    }
    if have < needed {
        let ix = system_ix(vec![AccountMeta::new(*payer.key, true), AccountMeta::new(*target.key, false)], 2, &(needed - have).to_le_bytes());
        invoke(&ix, &accounts)?;
    }
    invoke_signed(&system_ix(vec![AccountMeta::new(*target.key, true)], 8, &(space as u64).to_le_bytes()), &accounts, &[seeds])?;
    invoke_signed(&system_ix(vec![AccountMeta::new(*target.key, true)], 1, owner.as_ref()), &accounts, &[seeds])
}

/// TransferChecked from `from` to `to`, signed by `authority` (with `seeds` when it's a PDA).
#[allow(clippy::too_many_arguments)]
pub fn transfer<'a>(
    from: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    to: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    token: &AccountInfo<'a>,
    amount: u64,
    decimals: u8,
    seeds: &[&[u8]],
) -> ProgramResult {
    let mut data = vec![12u8];
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);
    let ix = Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*from.key, false),
            AccountMeta::new_readonly(*mint.key, false),
            AccountMeta::new(*to.key, false),
            AccountMeta::new_readonly(*authority.key, true),
        ],
        data,
    };
    let accounts = [from.clone(), mint.clone(), to.clone(), authority.clone(), token.clone()];
    if seeds.is_empty() {
        invoke(&ix, &accounts)
    } else {
        invoke_signed(&ix, &accounts, &[seeds])
    }
}

/// CloseAccount: the emptied `account`'s rent goes to `to`, signed by the PDA `authority`.
pub fn close_token_account<'a>(account: &AccountInfo<'a>, to: &AccountInfo<'a>, authority: &AccountInfo<'a>, token: &AccountInfo<'a>, seeds: &[&[u8]]) -> ProgramResult {
    let ix = Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![AccountMeta::new(*account.key, false), AccountMeta::new(*to.key, false), AccountMeta::new_readonly(*authority.key, true)],
        data: vec![9u8],
    };
    invoke_signed(&ix, &[account.clone(), to.clone(), authority.clone(), token.clone()], &[seeds])
}

/// CreateIdempotent of the Associated Token program: makes `owner`'s token account for `mint` at
/// `ata` unless it exists, paid by `payer`. The ATA program checks `ata` is the derived address.
/// Idempotent, so nobody can block a bounty by creating its vault first.
#[allow(clippy::too_many_arguments)]
pub fn create_ata_idempotent<'a>(
    payer: &AccountInfo<'a>,
    ata: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    token: &AccountInfo<'a>,
    ata_program: &AccountInfo<'a>,
) -> ProgramResult {
    let ix = Instruction {
        program_id: ASSOCIATED_TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*payer.key, true),
            AccountMeta::new(*ata.key, false),
            AccountMeta::new_readonly(*owner.key, false),
            AccountMeta::new_readonly(*mint.key, false),
            AccountMeta::new_readonly(*system.key, false),
            AccountMeta::new_readonly(*token.key, false),
        ],
        data: vec![1u8],
    };
    invoke(&ix, &[payer.clone(), ata.clone(), owner.clone(), mint.clone(), system.clone(), token.clone(), ata_program.clone()])
}

/// The associated token account address of `owner` for `mint`.
pub fn associated_token_address(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()], &ASSOCIATED_TOKEN_PROGRAM_ID).0
}

/// Closes an account this program owns: its lamports go to `to`, its data is zeroed and it goes
/// back to the System program, so it can't be read as a bounty again. With no lamports left, the
/// runtime drops it after the transaction.
pub fn close_program_account(account: &AccountInfo, to: &AccountInfo) -> ProgramResult {
    let lamports = account.lamports();
    **to.try_borrow_mut_lamports()? = to.lamports().checked_add(lamports).ok_or(ProgramError::ArithmeticOverflow)?;
    **account.try_borrow_mut_lamports()? = 0;
    account.try_borrow_mut_data()?.fill(0);
    account.assign(&SYSTEM_PROGRAM_ID);
    Ok(())
}

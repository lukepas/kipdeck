//! Runs the program on the host, without a validator: solana-program's syscall stubs are swapped
//! for a tiny System, SPL Token and Associated Token program, a clock the test sets, and a log the
//! test reads back.
//! It is just enough runtime for the escrow's own instructions, and it checks what the real one
//! would: that every signer signed or is a PDA of the calling program, and that a failed
//! instruction changes nothing.

#![allow(dead_code)]

use bounty_escrow::cpi::{ASSOCIATED_TOKEN_PROGRAM_ID, MINT_LEN, SYSTEM_PROGRAM_ID, TOKEN_ACCOUNT_LEN, TOKEN_PROGRAM_ID};

const LOADER_ID: Pubkey = solana_program::pubkey!("BPFLoaderUpgradeab1e11111111111111111111111");
use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    instruction::Instruction,
    program_error::ProgramError,
    program_stubs::{set_syscall_stubs, SyscallStubs},
    pubkey::Pubkey,
    rent::Rent,
};
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::sync::Once;

thread_local! {
    static NOW: Cell<i64> = const { Cell::new(0) };
    static CALLER: Cell<Pubkey> = const { Cell::new(Pubkey::new_from_array([0; 32])) };
    static LOGS: RefCell<Vec<Vec<u8>>> = const { RefCell::new(Vec::new()) };
}

const SUCCESS: u64 = 0;

fn info<'a, 'b>(infos: &'b [AccountInfo<'a>], key: &Pubkey) -> Result<&'b AccountInfo<'a>, ProgramError> {
    infos.iter().find(|i| i.key == key).ok_or(ProgramError::NotEnoughAccountKeys)
}

fn u64_at(d: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(d[at..at + 8].try_into().unwrap())
}

fn key_at(d: &[u8], at: usize) -> Pubkey {
    Pubkey::new_from_array(d[at..at + 32].try_into().unwrap())
}

fn move_lamports(from: &AccountInfo, to: &AccountInfo, n: u64) -> ProgramResult {
    let have = from.lamports();
    if have < n {
        return Err(ProgramError::InsufficientFunds);
    }
    **from.try_borrow_mut_lamports()? = have - n;
    **to.try_borrow_mut_lamports()? += n;
    Ok(())
}

struct Stubs;

impl Stubs {
    fn system(&self, ix: &Instruction, infos: &[AccountInfo]) -> ProgramResult {
        let tag = u32::from_le_bytes(ix.data[0..4].try_into().unwrap());
        let body = &ix.data[4..];
        match tag {
            // CreateAccount { lamports, space, owner }
            0 => {
                let (from, to) = (info(infos, &ix.accounts[0].pubkey)?, info(infos, &ix.accounts[1].pubkey)?);
                if to.lamports() != 0 || !to.data_is_empty() {
                    return Err(ProgramError::AccountAlreadyInitialized);
                }
                move_lamports(from, to, u64_at(body, 0))?;
                *to.try_borrow_mut_data()? = Box::leak(vec![0u8; u64_at(body, 8) as usize].into_boxed_slice());
                to.assign(&key_at(body, 16));
                Ok(())
            }
            // Assign { owner }
            1 => {
                info(infos, &ix.accounts[0].pubkey)?.assign(&key_at(body, 0));
                Ok(())
            }
            // Transfer { lamports }
            2 => move_lamports(info(infos, &ix.accounts[0].pubkey)?, info(infos, &ix.accounts[1].pubkey)?, u64_at(body, 0)),
            // Allocate { space }
            8 => {
                let to = info(infos, &ix.accounts[0].pubkey)?;
                if !to.data_is_empty() {
                    return Err(ProgramError::AccountAlreadyInitialized);
                }
                *to.try_borrow_mut_data()? = Box::leak(vec![0u8; u64_at(body, 0) as usize].into_boxed_slice());
                Ok(())
            }
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }

    fn token(&self, ix: &Instruction, infos: &[AccountInfo]) -> ProgramResult {
        let acct = |n: usize| info(infos, &ix.accounts[n].pubkey);
        let token_owned = |i: &AccountInfo| if i.owner == &TOKEN_PROGRAM_ID { Ok(()) } else { Err(ProgramError::IncorrectProgramId) };
        match ix.data[0] {
            // InitializeAccount3 { owner }: account, mint
            18 => {
                let (a, mint) = (acct(0)?, acct(1)?);
                token_owned(a)?;
                token_owned(mint)?;
                let mut d = a.try_borrow_mut_data()?;
                if d.len() != TOKEN_ACCOUNT_LEN || d[108] != 0 {
                    return Err(ProgramError::AccountAlreadyInitialized);
                }
                d[0..32].copy_from_slice(mint.key.as_ref());
                d[32..64].copy_from_slice(&ix.data[1..33]);
                d[108] = 1;
                Ok(())
            }
            // TransferChecked { amount, decimals }: from, mint, to, authority
            12 => {
                let (from, mint, to, auth) = (acct(0)?, acct(1)?, acct(2)?, acct(3)?);
                for i in [from, mint, to] {
                    token_owned(i)?;
                }
                let amount = u64_at(&ix.data, 1);
                if mint.try_borrow_data()?[44] != ix.data[9] {
                    return Err(ProgramError::Custom(18)); // MintDecimalsMismatch
                }
                let (fd, td) = (from.try_borrow_data()?.to_vec(), to.try_borrow_data()?.to_vec());
                if key_at(&fd, 0) != *mint.key || key_at(&td, 0) != *mint.key {
                    return Err(ProgramError::Custom(3)); // MintMismatch
                }
                if key_at(&fd, 32) != *auth.key {
                    return Err(ProgramError::Custom(4)); // OwnerMismatch
                }
                let have = u64_at(&fd, 64);
                if have < amount {
                    return Err(ProgramError::Custom(1)); // InsufficientFunds
                }
                from.try_borrow_mut_data()?[64..72].copy_from_slice(&(have - amount).to_le_bytes());
                let theirs = u64_at(&to.try_borrow_data()?, 64);
                to.try_borrow_mut_data()?[64..72].copy_from_slice(&(theirs + amount).to_le_bytes());
                Ok(())
            }
            // CloseAccount: account, destination, authority
            9 => {
                let (a, dest, auth) = (acct(0)?, acct(1)?, acct(2)?);
                token_owned(a)?;
                let d = a.try_borrow_data()?.to_vec();
                if key_at(&d, 32) != *auth.key {
                    return Err(ProgramError::Custom(4));
                }
                if u64_at(&d, 64) != 0 {
                    return Err(ProgramError::Custom(11)); // NonNativeHasBalance
                }
                move_lamports(a, dest, a.lamports())?;
                a.try_borrow_mut_data()?.fill(0);
                Ok(())
            }
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}

impl Stubs {
    /// CreateIdempotent: payer, ata, owner, mint, system, token. Checks the address is the derived
    /// one, as the real program does, and leaves an existing account of the right owner and mint.
    fn associated_token(&self, ix: &Instruction, infos: &[AccountInfo]) -> ProgramResult {
        if ix.data != [1] {
            return Err(ProgramError::InvalidInstructionData);
        }
        let acct = |n: usize| info(infos, &ix.accounts[n].pubkey);
        let (payer, ata, owner, mint) = (acct(0)?, acct(1)?, acct(2)?, acct(3)?);
        let (want, _) = Pubkey::find_program_address(&[owner.key.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.key.as_ref()], &ASSOCIATED_TOKEN_PROGRAM_ID);
        if *ata.key != want {
            return Err(ProgramError::InvalidSeeds);
        }
        if ata.owner == &TOKEN_PROGRAM_ID && ata.data_len() == TOKEN_ACCOUNT_LEN {
            let d = ata.try_borrow_data()?;
            return if key_at(&d, 0) == *mint.key && key_at(&d, 32) == *owner.key { Ok(()) } else { Err(ProgramError::IllegalOwner) };
        }
        let needed = Rent::default().minimum_balance(TOKEN_ACCOUNT_LEN);
        move_lamports(payer, ata, needed.saturating_sub(ata.lamports()))?;
        let mut data = vec![0u8; TOKEN_ACCOUNT_LEN];
        data[0..32].copy_from_slice(mint.key.as_ref());
        data[32..64].copy_from_slice(owner.key.as_ref());
        data[108] = 1;
        *ata.try_borrow_mut_data()? = Box::leak(data.into_boxed_slice());
        ata.assign(&TOKEN_PROGRAM_ID);
        Ok(())
    }
}

impl SyscallStubs for Stubs {
    fn sol_log(&self, _message: &str) {}

    fn sol_invoke_signed(&self, ix: &Instruction, infos: &[AccountInfo], seeds: &[&[&[u8]]]) -> ProgramResult {
        let caller = CALLER.with(|c| c.get());
        let pdas: Vec<Pubkey> = seeds.iter().map(|s| Pubkey::create_program_address(s, &caller)).collect::<Result<_, _>>().map_err(|_| ProgramError::InvalidSeeds)?;
        for m in &ix.accounts {
            let i = info(infos, &m.pubkey)?;
            if m.is_signer && !i.is_signer && !pdas.contains(&m.pubkey) {
                return Err(ProgramError::MissingRequiredSignature);
            }
            if m.is_writable && !i.is_writable {
                return Err(ProgramError::InvalidArgument);
            }
        }
        if ix.program_id == SYSTEM_PROGRAM_ID {
            self.system(ix, infos)
        } else if ix.program_id == TOKEN_PROGRAM_ID {
            self.token(ix, infos)
        } else if ix.program_id == ASSOCIATED_TOKEN_PROGRAM_ID {
            self.associated_token(ix, infos)
        } else {
            Err(ProgramError::IncorrectProgramId)
        }
    }

    fn sol_get_clock_sysvar(&self, var_addr: *mut u8) -> u64 {
        let clock = Clock { unix_timestamp: NOW.with(|n| n.get()), ..Clock::default() };
        unsafe { (var_addr as *mut Clock).write(clock) };
        SUCCESS
    }

    fn sol_get_rent_sysvar(&self, var_addr: *mut u8) -> u64 {
        unsafe { (var_addr as *mut Rent).write(Rent::default()) };
        SUCCESS
    }

    fn sol_log_data(&self, fields: &[&[u8]]) {
        LOGS.with(|l| l.borrow_mut().extend(fields.iter().map(|f| f.to_vec())));
    }
}

static INSTALL: Once = Once::new();

/// An account as the ledger keeps it between instructions.
#[derive(Clone, Debug, Default)]
pub struct Account {
    pub lamports: u64,
    pub data: Vec<u8>,
    pub owner: Pubkey,
}

/// Every account the test knows, by address, and the program under test.
pub struct Ledger {
    pub program_id: Pubkey,
    pub accounts: HashMap<Pubkey, Account>,
    pub now: i64,
}

/// One account an instruction takes: its address, and whether it signs and is written.
pub struct Meta(pub Pubkey, pub bool, pub bool);

pub fn signer(k: Pubkey) -> Meta {
    Meta(k, true, true)
}
pub fn writable(k: Pubkey) -> Meta {
    Meta(k, false, true)
}
pub fn readonly(k: Pubkey) -> Meta {
    Meta(k, false, false)
}

pub fn key(n: u8) -> Pubkey {
    Pubkey::new_from_array([n; 32])
}

impl Ledger {
    pub fn new(program_id: Pubkey) -> Self {
        INSTALL.call_once(|| {
            set_syscall_stubs(Box::new(Stubs));
        });
        let mut l = Ledger { program_id, accounts: HashMap::new(), now: 1_000 };
        l.put(SYSTEM_PROGRAM_ID, Account { lamports: 1, data: vec![], owner: Pubkey::default() });
        l.put(TOKEN_PROGRAM_ID, Account { lamports: 1, data: vec![], owner: LOADER_ID });
        l.put(ASSOCIATED_TOKEN_PROGRAM_ID, Account { lamports: 1, data: vec![], owner: LOADER_ID });
        l
    }

    pub fn put(&mut self, k: Pubkey, a: Account) {
        self.accounts.insert(k, a);
    }

    pub fn get(&self, k: &Pubkey) -> Account {
        self.accounts.get(k).cloned().unwrap_or_default()
    }

    /// A wallet with SOL to pay rent with.
    pub fn wallet(&mut self, k: Pubkey) {
        self.put(k, Account { lamports: 10_000_000_000, data: vec![], owner: SYSTEM_PROGRAM_ID });
    }

    pub fn mint(&mut self, k: Pubkey, decimals: u8) {
        let mut data = vec![0u8; MINT_LEN];
        data[44] = decimals;
        data[45] = 1;
        self.put(k, Account { lamports: Rent::default().minimum_balance(MINT_LEN), data, owner: TOKEN_PROGRAM_ID });
    }

    pub fn token_account(&mut self, k: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) {
        let mut data = vec![0u8; TOKEN_ACCOUNT_LEN];
        data[0..32].copy_from_slice(mint.as_ref());
        data[32..64].copy_from_slice(owner.as_ref());
        data[64..72].copy_from_slice(&amount.to_le_bytes());
        data[108] = 1;
        self.put(k, Account { lamports: Rent::default().minimum_balance(TOKEN_ACCOUNT_LEN), data, owner: TOKEN_PROGRAM_ID });
    }

    /// The token balance of a token account (0 when it's gone).
    pub fn balance(&self, k: &Pubkey) -> u64 {
        let a = self.get(k);
        if a.data.len() == TOKEN_ACCOUNT_LEN {
            u64_at(&a.data, 64)
        } else {
            0
        }
    }

    /// The associated token account of `owner` for `mint`.
    pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM_ID.as_ref(), mint.as_ref()], &ASSOCIATED_TOKEN_PROGRAM_ID).0
    }

    /// Runs one instruction at `self.now`. Like the runtime, it keeps the changes only if it
    /// succeeded. Returns the result and the events it logged.
    pub fn run(&mut self, metas: &[Meta], data: &[u8]) -> (ProgramResult, Vec<Vec<u8>>) {
        NOW.with(|n| n.set(self.now));
        CALLER.with(|c| c.set(self.program_id));
        LOGS.with(|l| l.borrow_mut().clear());
        let infos: Vec<AccountInfo<'static>> = metas
            .iter()
            .map(|Meta(k, is_signer, is_writable)| {
                let a = self.get(k);
                AccountInfo::new(
                    Box::leak(Box::new(*k)),
                    *is_signer,
                    *is_writable,
                    Box::leak(Box::new(a.lamports)),
                    Box::leak(a.data.into_boxed_slice()),
                    Box::leak(Box::new(a.owner)),
                    false,
                    0,
                )
            })
            .collect();
        let program_id = self.program_id;
        let result = bounty_escrow::processor::process(&program_id, &infos, data);
        if result.is_ok() {
            for i in &infos {
                self.put(*i.key, Account { lamports: i.lamports(), data: i.try_borrow_data().unwrap().to_vec(), owner: *i.owner });
            }
        }
        (result, LOGS.with(|l| l.borrow().clone()))
    }
}

//! The bounty escrow program: native solana-program, no Anchor, so it builds with plain cargo and
//! `cargo build-sbf` alike. It checks accounts and moves tokens; the rules about when a bounty may
//! move live in `bounty-escrow-core` (see its `machine` module).

pub mod cpi;
pub mod processor;

pub use bounty_escrow_core as core;

#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint {
    use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, pubkey::Pubkey};

    solana_program::entrypoint!(process_instruction);

    fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        crate::processor::process(program_id, accounts, data)
    }
}

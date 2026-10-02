//! The addresses the SDK must derive exactly as the program does: a bounty, its vault (the bounty's
//! associated token account), a funder's contribution, and an associated token account, for a fixed
//! program id. Kept in fixtures/vectors.json under "pda.*" (`BLESS=1 cargo test` rewrites them) and
//! checked by the SDK's tests too.

use bounty_escrow::cpi::associated_token_address;
use bounty_escrow_core::{BOUNTY_SEED, CONTRIB_SEED};
use serde_json::{json, Map, Value};
use solana_program::hash::hash;
use solana_program::pubkey::Pubkey;
use std::path::PathBuf;

fn hex(b: &[u8]) -> String {
    b.iter().fold(String::new(), |s, x| s + &format!("{x:02x}"))
}

fn vectors() -> Map<String, Value> {
    let program = Pubkey::new_from_array([0x11; 32]);
    let repo = "webdevcody/agent-office";
    let repo_hash = hash(repo.as_bytes()).to_bytes();
    let (bounty, bounty_bump) = Pubkey::find_program_address(&[BOUNTY_SEED, &repo_hash, &12u64.to_le_bytes(), &[3]], &program);
    let funder = Pubkey::new_from_array([1; 32]);
    let (contribution, contribution_bump) = Pubkey::find_program_address(&[CONTRIB_SEED, bounty.as_ref(), funder.as_ref()], &program);
    let mint = Pubkey::new_from_array([9; 32]);
    let vault = associated_token_address(&bounty, &mint);
    let owner = Pubkey::new_from_array([4; 32]);
    let mut m = Map::new();
    m.insert("pda.programId".into(), json!(program.to_string()));
    m.insert("pda.repo".into(), json!(repo));
    m.insert("pda.repoHash".into(), json!(hex(&repo_hash)));
    m.insert("pda.bounty12n3".into(), json!({ "address": bounty.to_string(), "bump": bounty_bump, "issue": 12, "nonce": 3 }));
    m.insert("pda.funder".into(), json!(funder.to_string()));
    m.insert("pda.contribution".into(), json!({ "address": contribution.to_string(), "bump": contribution_bump }));
    m.insert("pda.vault".into(), json!({ "mint": mint.to_string(), "address": vault.to_string() }));
    m.insert("pda.ata".into(), json!({ "owner": owner.to_string(), "mint": mint.to_string(), "address": associated_token_address(&owner, &mint).to_string() }));
    m
}

#[test]
fn derived_addresses_match_the_shared_vectors() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/vectors.json");
    let mut saved: Map<String, Value> = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let now = vectors();
    if std::env::var("BLESS").is_ok() {
        saved.retain(|k, _| !k.starts_with("pda.") || now.contains_key(k));
        saved.extend(now.clone());
        std::fs::write(&path, serde_json::to_string_pretty(&Value::Object(saved.clone())).unwrap() + "\n").unwrap();
    }
    for (k, v) in &now {
        assert_eq!(saved.get(k), Some(v), "vectors.json is out of date for {k} (BLESS=1 cargo test rewrites it)");
    }
}

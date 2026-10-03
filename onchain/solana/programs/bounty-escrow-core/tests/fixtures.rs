//! Runs fixtures/transitions.json through the state machine, and checks every wire format against
//! fixtures/vectors.json (which the SDK checks too). `BLESS=1 cargo test` rewrites vectors.json
//! after a deliberate layout change.

use bounty_escrow_core::event::EscrowEvent;
use bounty_escrow_core::instruction::EscrowInstruction;
use bounty_escrow_core::machine::{self, Cancel, InitArgs, ReleaseArgs};
use bounty_escrow_core::state::{Bounty, BountyState, Contribution};
use bounty_escrow_core::{EscrowError, Key, MAX_DURATION_SECS};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures")
}

fn load(name: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(fixtures().join(name)).unwrap()).unwrap()
}

fn u64_of(v: &Value) -> u64 {
    match v {
        Value::String(s) => s.parse().unwrap(),
        Value::Number(n) => n.as_u64().unwrap(),
        _ => panic!("not an amount: {v}"),
    }
}

fn i64_of(v: &Value) -> i64 {
    v.as_i64().unwrap_or_else(|| panic!("not a time: {v}"))
}

fn error_named(name: &str) -> EscrowError {
    *EscrowError::ALL.iter().find(|e| e.name() == name).unwrap_or_else(|| panic!("no error named {name}"))
}

fn bytes_of_hex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn key_of(v: &Value) -> Key {
    match v {
        Value::Number(n) => [n.as_u64().unwrap() as u8; 32],
        Value::String(s) => bytes_of_hex(s).try_into().unwrap(),
        _ => panic!("not a key: {v}"),
    }
}

#[test]
fn transitions_match_the_shared_table() {
    let doc = load("transitions.json");
    assert_eq!(doc["maxDurationSecs"].as_i64().unwrap(), MAX_DURATION_SECS);
    let keys: HashMap<String, Key> = doc["keys"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), key_of(v))).collect();
    let named = |step: &Value, field: &str, default: &str| -> Key { keys[step.get(field).and_then(|v| v.as_str()).unwrap_or(default)] };
    let cases = doc["cases"].as_array().unwrap();
    assert!(cases.len() >= 15);
    let bounty_key = keys["bounty"];
    for case in cases {
        let name = case["name"].as_str().unwrap();
        let mut bounty: Option<Bounty> = None;
        let mut contributions: HashMap<Key, Contribution> = HashMap::new();
        for (i, step) in case["steps"].as_array().unwrap().iter().enumerate() {
            let at = format!("{name}, step {i} ({})", step["op"]);
            let now = i64_of(&step["now"]);
            let mut cancelled: Option<Cancel> = None;
            let result: Result<Option<u64>, EscrowError> = match step["op"].as_str().unwrap() {
                "init" => machine::init(
                    InitArgs {
                        repo_hash: keys["repo"],
                        issue: 12,
                        nonce: 0,
                        mint: named(step, "mint", "usdc"),
                        vault: [11; 32],
                        expiry_ts: i64_of(&step["expiry"]),
                        attester: named(step, "attester", "attester"),
                        approver: named(step, "approver", "approver"),
                        creator: keys["creator"],
                        bump: 254,
                    },
                    now,
                )
                .map(|b| {
                    bounty = Some(b);
                    None
                }),
                "fund" => {
                    let b = bounty.as_mut().expect("opened first");
                    let funder = named(step, "funder", "funder");
                    let before = contributions.get(&funder).cloned();
                    machine::fund(b, before, &funder, u64_of(&step["amount"]), 250, &bounty_key, now).map(|c| {
                        contributions.insert(funder, c);
                        None
                    })
                }
                "claim" => {
                    let b = bounty.as_mut().expect("opened first");
                    machine::claim(b, &named(step, "signer", "attester"), step["pr"].as_u64().unwrap(), &named(step, "wallet", "agent"), now).map(|_| None)
                }
                "release" => {
                    let b = bounty.as_mut().expect("opened first");
                    let vault = step.get("vault").map(u64_of).unwrap_or(b.total);
                    let a = ReleaseArgs {
                        attester: named(step, "attester", "attester"),
                        approver: named(step, "approver", "approver"),
                        pr_number: step["pr"].as_u64().unwrap(),
                        merge_sha: [0xab; 20],
                        merged_by_hash: [0xcd; 32],
                        vault_balance: vault,
                    };
                    machine::release(b, &a, now).map(Some)
                }
                "refund" => {
                    let b = bounty.as_mut().expect("opened first");
                    let funder = named(step, "funder", "funder");
                    let mut c = contributions.get(&funder).cloned().expect("funded first");
                    machine::refund(b, &mut c, &bounty_key, now).map(|paid| {
                        contributions.insert(funder, c);
                        Some(paid)
                    })
                }
                "cancel" => {
                    let b = bounty.as_mut().expect("opened first");
                    machine::cancel(b, step["creator_signed"].as_bool().unwrap_or(false), &named(step, "approver", "nobody"), 0, now).map(|c| {
                        cancelled = Some(c);
                        None
                    })
                }
                op => panic!("unknown op {op}"),
            };
            match step["expect"].as_str().unwrap() {
                "ok" => {
                    let paid = result.unwrap_or_else(|e| panic!("{at}: expected ok, got {}", e.name()));
                    if let Some(p) = step.get("paid") {
                        assert_eq!(paid, Some(u64_of(p)), "{at}: paid");
                    }
                    if let Some(r) = step.get("result") {
                        let want = if r == "close" { Cancel::Close } else { Cancel::Refunds };
                        assert_eq!(cancelled, Some(want), "{at}: cancel result");
                    }
                }
                want => assert_eq!(result.err(), Some(error_named(want)), "{at}"),
            }
            let b = bounty.as_ref();
            if let Some(s) = step.get("state") {
                assert_eq!(b.unwrap().state.name(), s.as_str().unwrap(), "{at}: state");
            }
            if let Some(t) = step.get("total_after") {
                assert_eq!(b.unwrap().total, u64_of(t), "{at}: total");
            }
            if let Some(n) = step.get("funders_after") {
                assert_eq!(b.unwrap().funder_count as u64, n.as_u64().unwrap(), "{at}: funders");
            }
            if let Some(c) = step.get("contribution_after") {
                assert_eq!(contributions[&named(step, "funder", "funder")].amount, u64_of(c), "{at}: contribution");
            }
            if let Some(p) = step.get("pr_after") {
                assert_eq!(b.unwrap().pr_number, p.as_u64(), "{at}: pr");
            }
            if let Some(w) = step.get("wallet_after") {
                assert_eq!(b.unwrap().claimant_wallet, Some(keys[w.as_str().unwrap()]), "{at}: wallet");
            }
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |s, b| s + &format!("{b:02x}"))
}

/// One of each account, instruction and event, with every field set to something telling.
fn vectors() -> Map<String, Value> {
    let k = |n: u8| [n; 32];
    let sha: [u8; 20] = core::array::from_fn(|i| i as u8 + 1);
    let bounty = Bounty {
        state: BountyState::Released,
        bump: 254,
        nonce: 3,
        mint: k(9),
        vault: k(11),
        repo_hash: k(10),
        issue: 12,
        attester: k(2),
        approver: k(3),
        creator: k(7),
        created_at: 1_790_000_000,
        expiry_ts: 1_792_592_000,
        total: 55_000_000,
        funder_count: 2,
        refunded_count: 0,
        claimant_wallet: Some(k(4)),
        pr_number: Some(77),
        claimed_at: 1_790_050_000,
        merge_sha: sha,
        merged_by_hash: k(12),
        paid: 55_000_000,
        settled_at: 1_790_100_000,
    };
    let open = Bounty { state: BountyState::Open, claimant_wallet: None, pr_number: None, claimed_at: 0, merge_sha: [0; 20], merged_by_hash: [0; 32], paid: 0, settled_at: 0, ..bounty.clone() };
    let contribution = Contribution { bump: 250, refunded: true, bounty: k(8), funder: k(1), amount: 35_000_000 };
    let pack_b = |b: &Bounty| {
        let mut out = vec![0u8; Bounty::LEN];
        b.pack(&mut out).unwrap();
        Value::String(hex(&out))
    };
    let mut contribution_bytes = vec![0u8; Contribution::LEN];
    contribution.pack(&mut contribution_bytes).unwrap();
    let ix = |i: EscrowInstruction| Value::String(hex(&i.pack()));
    let ev = |e: EscrowEvent| Value::String(hex(&e.pack()));
    let mut m = Map::new();
    m.insert(
        "about".into(),
        json!("Byte layouts both sides must agree on: keys are 32 copies of one byte (1 funder, 2 attester, 3 approver, 4 claimant, 7 creator, 8 bounty, 9 mint, 10 repo hash, 11 vault, 12 merged-by hash), the merge sha is bytes 1..=20. Written by BLESS=1 cargo test."),
    );
    m.insert("bounty".into(), pack_b(&bounty));
    m.insert("bountyOpen".into(), pack_b(&open));
    m.insert("contribution".into(), Value::String(hex(&contribution_bytes)));
    m.insert("ix.initBounty".into(), ix(EscrowInstruction::InitBounty { repo_hash: k(10), issue: 12, nonce: 3, expiry_ts: 1_792_592_000, attester: k(2), approver: k(3) }));
    m.insert("ix.fund".into(), ix(EscrowInstruction::Fund { amount: 50_000_000 }));
    m.insert("ix.claim".into(), ix(EscrowInstruction::Claim { pr_number: 77, claimant_wallet: k(4) }));
    m.insert("ix.release".into(), ix(EscrowInstruction::Release { merge_sha: sha, merged_by_hash: k(12), pr_number: 77 }));
    m.insert("ix.refund".into(), ix(EscrowInstruction::Refund));
    m.insert("ix.cancel".into(), ix(EscrowInstruction::Cancel));
    m.insert(
        "ev.bountyCreated".into(),
        ev(EscrowEvent::BountyCreated { bounty: k(8), repo_hash: k(10), issue: 12, nonce: 3, mint: k(9), attester: k(2), approver: k(3), creator: k(7), expiry_ts: 1_792_592_000 }),
    );
    m.insert("ev.funded".into(), ev(EscrowEvent::Funded { bounty: k(8), funder: k(1), amount: 5_000_000, contribution: 35_000_000, total: 55_000_000 }));
    m.insert("ev.claimed".into(), ev(EscrowEvent::Claimed { bounty: k(8), pr_number: 77, claimant_wallet: k(4) }));
    m.insert(
        "ev.released".into(),
        ev(EscrowEvent::Released { bounty: k(8), claimant_wallet: k(4), amount: 55_000_000, pr_number: 77, merge_sha: sha, merged_by_hash: k(12), attester: k(2), approver: k(3) }),
    );
    m.insert("ev.refunded".into(), ev(EscrowEvent::Refunded { bounty: k(8), funder: k(1), amount: 35_000_000, remaining: 1 }));
    m.insert("ev.cancelled".into(), ev(EscrowEvent::Cancelled { bounty: k(8), total: 55_000_000, closed: false }));
    let mut errors = Map::new();
    for e in EscrowError::ALL {
        errors.insert(e.name().into(), json!(e.code()));
    }
    m.insert("errors".into(), Value::Object(errors));
    m
}

#[test]
fn wire_formats_match_the_shared_vectors() {
    let path = fixtures().join("vectors.json");
    let now = vectors();
    if std::env::var("BLESS").is_ok() {
        // Merged in: the program crate's test keeps the PDA vectors ("pda.*") in the same file.
        let mut all = std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str::<Map<String, Value>>(&s).ok()).unwrap_or_default();
        all.retain(|k, _| k.starts_with("pda."));
        all.extend(now.clone());
        std::fs::write(&path, serde_json::to_string_pretty(&Value::Object(all)).unwrap() + "\n").unwrap();
    }
    let saved = load("vectors.json");
    let saved = saved.as_object().unwrap();
    for (k, v) in &now {
        assert_eq!(saved.get(k), Some(v), "vectors.json is out of date for {k} (BLESS=1 cargo test rewrites it)");
    }
}

#[test]
fn unpacking_the_vectors_gives_back_what_was_packed() {
    // From memory rather than the file, which a BLESS run may be rewriting alongside.
    let saved = Value::Object(vectors());
    let bytes = |k: &str| bytes_of_hex(saved[k].as_str().unwrap());
    let b = Bounty::unpack(&bytes("bounty")).unwrap();
    assert_eq!((b.issue, b.total, b.pr_number, b.state, b.claimant_wallet), (12, 55_000_000, Some(77), BountyState::Released, Some([4; 32])));
    let open = Bounty::unpack(&bytes("bountyOpen")).unwrap();
    assert_eq!((open.state, open.claimant_wallet, open.pr_number), (BountyState::Open, None, None));
    assert_eq!(Contribution::unpack(&bytes("contribution")).unwrap().amount, 35_000_000);
    assert_eq!(
        EscrowInstruction::unpack(&bytes("ix.release")).unwrap(),
        EscrowInstruction::Release { merge_sha: core::array::from_fn(|i| i as u8 + 1), merged_by_hash: [12; 32], pr_number: 77 }
    );
}

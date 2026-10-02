//! Why a step was refused. On chain these are `ProgramError::Custom(code)`; the SDK maps the codes
//! back to the same names (`ERROR_CODES` in sdk/src/layout.ts).

/// Codes start at 6000, as Anchor programs' do, so explorers and wallets don't mistake them for the
/// runtime's own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum EscrowError {
    /// The instruction's tag isn't one the program knows.
    InvalidInstruction = 6000,
    /// An account's or instruction's bytes aren't the layout expected.
    InvalidData = 6001,
    /// Funding with nothing.
    InvalidAmount = 6002,
    /// An expiry that has passed, or is more than a year out.
    InvalidExpiry = 6003,
    /// The bounty isn't in a state that allows this step.
    WrongState = 6004,
    /// Too late: the bounty expired.
    Expired = 6005,
    /// Too early: a refund before the bounty expired (and it wasn't cancelled).
    NotExpired = 6006,
    /// The signer isn't the attester, the approver or whoever the step needs.
    Unauthorized = 6007,
    /// A claim or release that names no pull request.
    InvalidPullRequest = 6008,
    /// A claim to nobody, or an attester or approver that is nobody.
    InvalidRecipient = 6009,
    /// An amount that doesn't fit in a u64, or too many funders.
    Overflow = 6010,
    /// A token account that isn't of the bounty's mint.
    WrongMint = 6011,
    /// An account that isn't the one its seeds, owner or the bounty say it must be.
    WrongAccount = 6012,
    /// The bounty account already exists.
    AlreadyInitialized = 6013,
    /// A mint that isn't on the compiled-in allowlist (devnet USDC, and a test mint in test builds).
    MintNotAllowed = 6014,
    /// A release for another pull request than the one the bounty was claimed for.
    PullRequestMismatch = 6015,
    /// That contribution was already paid back.
    AlreadyRefunded = 6016,
    /// The attester and the approver are the same key, so a release would need only one person.
    SameAuthority = 6017,
    /// A token program other than the original SPL Token program.
    WrongTokenProgram = 6018,
}

impl EscrowError {
    pub const ALL: [EscrowError; 19] = [
        EscrowError::InvalidInstruction,
        EscrowError::InvalidData,
        EscrowError::InvalidAmount,
        EscrowError::InvalidExpiry,
        EscrowError::WrongState,
        EscrowError::Expired,
        EscrowError::NotExpired,
        EscrowError::Unauthorized,
        EscrowError::InvalidPullRequest,
        EscrowError::InvalidRecipient,
        EscrowError::Overflow,
        EscrowError::WrongMint,
        EscrowError::WrongAccount,
        EscrowError::AlreadyInitialized,
        EscrowError::MintNotAllowed,
        EscrowError::PullRequestMismatch,
        EscrowError::AlreadyRefunded,
        EscrowError::SameAuthority,
        EscrowError::WrongTokenProgram,
    ];

    pub fn code(self) -> u32 {
        self as u32
    }

    /// The name the fixtures and the SDK use.
    pub fn name(self) -> &'static str {
        match self {
            EscrowError::InvalidInstruction => "InvalidInstruction",
            EscrowError::InvalidData => "InvalidData",
            EscrowError::InvalidAmount => "InvalidAmount",
            EscrowError::InvalidExpiry => "InvalidExpiry",
            EscrowError::WrongState => "WrongState",
            EscrowError::Expired => "Expired",
            EscrowError::NotExpired => "NotExpired",
            EscrowError::Unauthorized => "Unauthorized",
            EscrowError::InvalidPullRequest => "InvalidPullRequest",
            EscrowError::InvalidRecipient => "InvalidRecipient",
            EscrowError::Overflow => "Overflow",
            EscrowError::WrongMint => "WrongMint",
            EscrowError::WrongAccount => "WrongAccount",
            EscrowError::AlreadyInitialized => "AlreadyInitialized",
            EscrowError::MintNotAllowed => "MintNotAllowed",
            EscrowError::PullRequestMismatch => "PullRequestMismatch",
            EscrowError::AlreadyRefunded => "AlreadyRefunded",
            EscrowError::SameAuthority => "SameAuthority",
            EscrowError::WrongTokenProgram => "WrongTokenProgram",
        }
    }
}

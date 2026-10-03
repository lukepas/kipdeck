// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MergeAttestor
/// @notice The fallback for Proof of Merge when EAS can't be used: one event per merged (or reverted,
/// or closed) agent pull request, carrying exactly the bytes an EAS attestation of the office's schema
/// would carry, so readers decode both the same way. Only the office's attester key writes here.
/// Testnets only: it refuses to deploy on Ethereum or Base mainnet.
contract MergeAttestor {
    error MainnetRefused();
    error NotAttester();
    error EmptyData();
    error UnknownRef();
    error NotLive();

    event MergeAttested(bytes32 indexed uid, bytes32 indexed refUID, address indexed attester, bytes data);
    event MergeRevoked(bytes32 indexed uid);

    address public immutable attester;
    uint64 public count;
    /// 0 never written, 1 live, 2 revoked.
    mapping(bytes32 => uint8) public status;

    constructor(address attester_) {
        if (block.chainid == 1 || block.chainid == 8453) revert MainnetRefused();
        attester = attester_;
    }

    /// @param data abi.encode of the schema's fields (see src/schema.ts).
    /// @param refUID the attestation this one follows up (a revert's original), or zero.
    function attest(bytes calldata data, bytes32 refUID) external returns (bytes32 uid) {
        if (msg.sender != attester) revert NotAttester();
        if (data.length == 0) revert EmptyData();
        if (refUID != bytes32(0) && status[refUID] == 0) revert UnknownRef();
        uid = keccak256(abi.encode(block.chainid, address(this), ++count, refUID, data));
        status[uid] = 1;
        emit MergeAttested(uid, refUID, msg.sender, data);
    }

    /// Reserved for errors: a wrong attestation, not a revert (that is a new one with outcome 2).
    function revoke(bytes32 uid) external {
        if (msg.sender != attester) revert NotAttester();
        if (status[uid] != 1) revert NotLive();
        status[uid] = 2;
        emit MergeRevoked(uid);
    }
}

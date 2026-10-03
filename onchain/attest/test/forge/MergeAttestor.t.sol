// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MergeAttestor} from "../../contracts/MergeAttestor.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function chainId(uint256) external;
    function recordLogs() external;
}

contract MergeAttestorTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ATTESTER = address(0xA77E57);
    MergeAttestor m;

    event MergeAttested(bytes32 indexed uid, bytes32 indexed refUID, address indexed attester, bytes data);

    function setUp() public {
        m = new MergeAttestor(ATTESTER);
    }

    function data(uint8 outcome) internal pure returns (bytes memory) {
        return abi.encode("acme/app", uint64(42), bytes20(0), bytes32(0), "claude", uint256(0), outcome, "", uint64(1));
    }

    function test_attests_and_counts() public {
        vm.prank(ATTESTER);
        bytes32 uid = m.attest(data(1), bytes32(0));
        require(uid != bytes32(0), "uid");
        require(m.status(uid) == 1, "live");
        require(m.count() == 1, "count");
    }

    function test_uids_differ() public {
        vm.prank(ATTESTER);
        bytes32 a = m.attest(data(1), bytes32(0));
        vm.prank(ATTESTER);
        bytes32 b = m.attest(data(1), bytes32(0));
        require(a != b, "distinct");
    }

    function test_revert_refers_to_original() public {
        vm.prank(ATTESTER);
        bytes32 a = m.attest(data(1), bytes32(0));
        vm.prank(ATTESTER);
        bytes32 b = m.attest(data(2), a);
        require(m.status(b) == 1 && m.status(a) == 1, "both live: a revert is not a revocation");
    }

    function test_only_attester() public {
        vm.expectRevert(MergeAttestor.NotAttester.selector);
        m.attest(data(1), bytes32(0));
    }

    function test_unknown_ref_refused() public {
        vm.prank(ATTESTER);
        vm.expectRevert(MergeAttestor.UnknownRef.selector);
        m.attest(data(2), keccak256("nope"));
    }

    function test_empty_refused() public {
        vm.prank(ATTESTER);
        vm.expectRevert(MergeAttestor.EmptyData.selector);
        m.attest("", bytes32(0));
    }

    function test_revoke_once() public {
        vm.prank(ATTESTER);
        bytes32 a = m.attest(data(1), bytes32(0));
        vm.prank(ATTESTER);
        m.revoke(a);
        require(m.status(a) == 2, "revoked");
        vm.prank(ATTESTER);
        vm.expectRevert(MergeAttestor.NotLive.selector);
        m.revoke(a);
    }

    function test_revoke_only_attester() public {
        vm.prank(ATTESTER);
        bytes32 a = m.attest(data(1), bytes32(0));
        vm.expectRevert(MergeAttestor.NotAttester.selector);
        m.revoke(a);
    }

    function test_refuses_mainnet() public {
        vm.chainId(8453);
        vm.expectRevert(MergeAttestor.MainnetRefused.selector);
        new MergeAttestor(ATTESTER);
        vm.chainId(1);
        vm.expectRevert(MergeAttestor.MainnetRefused.selector);
        new MergeAttestor(ATTESTER);
    }
}

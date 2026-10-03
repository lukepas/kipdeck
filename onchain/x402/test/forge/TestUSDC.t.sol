// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {TestUSDC} from "../../contracts/TestUSDC.sol";

interface Vm {
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function chainId(uint256 newChainId) external;
    function expectRevert(bytes4 selector) external;
}

contract TestUSDCTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    TestUSDC token;
    uint256 constant PAYER_KEY = 0xA11CE;
    address payer;
    address constant PAY_TO = address(0xBEEF);
    address constant FACILITATOR = address(0xFAC);

    function setUp() public {
        vm.warp(1_800_000_000);
        token = new TestUSDC();
        payer = vm.addr(PAYER_KEY);
        token.mint(payer, 1_000_000);
    }

    function digest(address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), payer, to, value, validAfter, validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }

    function sig(bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, d);
        return abi.encodePacked(r, s, v);
    }

    function eq(uint256 a, uint256 b) internal pure {
        require(a == b, "not equal");
    }

    function test_domain_matches_usdc() public view {
        require(keccak256(bytes(token.name())) == keccak256("USDC"), "name");
        require(keccak256(bytes(token.version())) == keccak256("2"), "version");
        eq(token.decimals(), 6);
    }

    function test_anyone_submits_a_signed_authorization_once() public {
        bytes32 nonce = keccak256("n1");
        bytes32 d = digest(PAY_TO, 100_000, block.timestamp - 600, block.timestamp + 300, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, d);
        vm.prank(FACILITATOR);
        token.transferWithAuthorization(payer, PAY_TO, 100_000, block.timestamp - 600, block.timestamp + 300, nonce, v, r, s);
        eq(token.balanceOf(PAY_TO), 100_000);
        eq(token.balanceOf(payer), 900_000);
        require(token.authorizationState(payer, nonce), "nonce used");
        vm.expectRevert(TestUSDC.AuthorizationUsedOrCanceled.selector);
        token.transferWithAuthorization(payer, PAY_TO, 100_000, block.timestamp - 600, block.timestamp + 300, nonce, v, r, s);
    }

    function test_bytes_signature_overload() public {
        bytes32 nonce = keccak256("n2");
        bytes memory signature = sig(digest(PAY_TO, 5, block.timestamp - 1, block.timestamp + 60, nonce));
        token.transferWithAuthorization(payer, PAY_TO, 5, block.timestamp - 1, block.timestamp + 60, nonce, signature);
        eq(token.balanceOf(PAY_TO), 5);
    }

    function test_a_changed_amount_or_payee_breaks_the_signature() public {
        bytes32 nonce = keccak256("n3");
        bytes memory signature = sig(digest(PAY_TO, 5, block.timestamp - 1, block.timestamp + 60, nonce));
        vm.expectRevert(TestUSDC.InvalidSignature.selector);
        token.transferWithAuthorization(payer, PAY_TO, 6, block.timestamp - 1, block.timestamp + 60, nonce, signature);
        vm.expectRevert(TestUSDC.InvalidSignature.selector);
        token.transferWithAuthorization(payer, address(0xBAD), 5, block.timestamp - 1, block.timestamp + 60, nonce, signature);
    }

    function test_the_time_window_holds() public {
        bytes32 nonce = keccak256("n4");
        uint256 start = block.timestamp + 10;
        bytes memory early = sig(digest(PAY_TO, 5, start, start + 60, nonce));
        vm.expectRevert(TestUSDC.AuthorizationNotYetValid.selector);
        token.transferWithAuthorization(payer, PAY_TO, 5, start, start + 60, nonce, early);
        bytes memory late = sig(digest(PAY_TO, 5, 0, block.timestamp, nonce));
        vm.expectRevert(TestUSDC.AuthorizationExpired.selector);
        token.transferWithAuthorization(payer, PAY_TO, 5, 0, block.timestamp, nonce, late);
    }

    function test_only_minters_mint() public {
        vm.prank(address(0xD00D));
        vm.expectRevert(TestUSDC.NotMinter.selector);
        token.mint(address(0xD00D), 1);
    }

    function test_refuses_to_deploy_on_base_mainnet() public {
        vm.chainId(8453);
        vm.expectRevert(TestUSDC.MainnetRefused.selector);
        new TestUSDC();
    }
}

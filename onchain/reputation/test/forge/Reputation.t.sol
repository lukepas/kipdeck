// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AgentRegistry} from "../../contracts/AgentRegistry.sol";
import {ReputationLog} from "../../contracts/ReputationLog.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function chainId(uint256) external;
}

contract ReputationTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AgentRegistry ids;
    ReputationLog rep;
    address registrar = address(0xA11CE);
    address office = address(0xB0B);

    function setUp() public {
        vm.chainId(84532);
        ids = new AgentRegistry();
        rep = new ReputationLog(address(ids));
    }

    function register() internal returns (uint256 id) {
        vm.prank(registrar);
        id = ids.register("https://office.example/agents/1.json");
    }

    function test_ids_start_at_one_and_carry_the_uri_and_wallet() public {
        uint256 id = register();
        require(id == 1, "first id is 1");
        require(ids.ownerOf(id) == registrar, "owner");
        require(ids.getAgentWallet(id) == registrar, "wallet");
        require(keccak256(bytes(ids.tokenURI(id))) == keccak256("https://office.example/agents/1.json"), "uri");
        require(ids.isAuthorizedOrOwner(registrar, id), "owner is authorized");
        require(!ids.isAuthorizedOrOwner(office, id), "office is not");
    }

    function test_only_the_owner_sets_the_uri() public {
        uint256 id = register();
        vm.prank(office);
        vm.expectRevert(AgentRegistry.NotAuthorized.selector);
        ids.setAgentURI(id, "https://evil.example");
        vm.prank(registrar);
        ids.setAgentURI(id, "https://office.example/agents/1.json?v=2");
    }

    function test_feedback_is_kept_and_averaged() public {
        uint256 id = register();
        vm.prank(office);
        rep.giveFeedback(id, 100, 0, "merge", "claude", "", "https://base-sepolia.easscan.org/attestation/view/0x01", bytes32(uint256(1)));
        vm.prank(office);
        rep.giveFeedback(id, 30, 0, "merge", "claude", "", "", bytes32(0));
        require(rep.getLastIndex(id, office) == 2, "two");
        (int128 v,, string memory t1,,) = rep.readFeedback(id, office, 1);
        require(v == 100 && keccak256(bytes(t1)) == keccak256("merge"), "first");
        address[] memory cs = new address[](1);
        cs[0] = office;
        (uint64 count, int128 avg,) = rep.getSummary(id, cs, "merge", "");
        require(count == 2 && avg == 65, "average");
        vm.prank(office);
        rep.revokeFeedback(id, 2);
        (count, avg,) = rep.getSummary(id, cs, "", "");
        require(count == 1 && avg == 100, "revoked left out");
    }

    function test_no_self_feedback() public {
        uint256 id = register();
        vm.prank(registrar);
        vm.expectRevert(bytes("Self-feedback not allowed"));
        rep.giveFeedback(id, 100, 0, "merge", "claude", "", "", bytes32(0));
    }

    function test_no_feedback_for_an_agent_that_does_not_exist() public {
        vm.prank(office);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NonexistentToken.selector, uint256(42)));
        rep.giveFeedback(42, 100, 0, "merge", "claude", "", "", bytes32(0));
    }

    function test_refuses_mainnet() public {
        vm.chainId(8453);
        vm.expectRevert(AgentRegistry.MainnetRefused.selector);
        new AgentRegistry();
        vm.chainId(1);
        vm.expectRevert(ReputationLog.MainnetRefused.selector);
        new ReputationLog(address(ids));
    }
}

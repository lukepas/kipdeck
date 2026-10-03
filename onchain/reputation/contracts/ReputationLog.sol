// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAgentIdentity {
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
}

/// @title ReputationLog
/// @notice The fallback for the ERC-8004 Reputation Registry, with the live registry's signatures and
/// events (erc-8004/erc-8004-contracts ReputationRegistryUpgradeable 2.0.0) for giveFeedback,
/// revokeFeedback, readFeedback, getLastIndex, getClients, getSummary and getIdentityRegistry.
/// Responses are left out. As in the live one, an agent's owner or approved operator may not give it
/// feedback, and an agent that doesn't exist can't get any. Testnets only.
contract ReputationLog {
    error MainnetRefused();

    int128 private constant MAX_ABS_VALUE = 1e38;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex);

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bool isRevoked;
        string tag1;
        string tag2;
    }

    address private immutable identityRegistry;
    mapping(uint256 => mapping(address => mapping(uint64 => Feedback))) private feedback;
    mapping(uint256 => mapping(address => uint64)) private lastIndex;
    mapping(uint256 => address[]) private clients;
    mapping(uint256 => mapping(address => bool)) private clientExists;

    constructor(address identityRegistry_) {
        if (block.chainid == 1 || block.chainid == 8453) revert MainnetRefused();
        require(identityRegistry_ != address(0), "bad identity");
        identityRegistry = identityRegistry_;
    }

    function getIdentityRegistry() external view returns (address) {
        return identityRegistry;
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(valueDecimals <= 18, "too many decimals");
        require(value >= -MAX_ABS_VALUE && value <= MAX_ABS_VALUE, "value too large");
        // Reverts for an agent that doesn't exist, as the live registry does.
        require(!IAgentIdentity(identityRegistry).isAuthorizedOrOwner(msg.sender, agentId), "Self-feedback not allowed");
        uint64 index = ++lastIndex[agentId][msg.sender];
        feedback[agentId][msg.sender][index] = Feedback({value: value, valueDecimals: valueDecimals, isRevoked: false, tag1: tag1, tag2: tag2});
        if (!clientExists[agentId][msg.sender]) {
            clients[agentId].push(msg.sender);
            clientExists[agentId][msg.sender] = true;
        }
        emit NewFeedback(agentId, msg.sender, index, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= lastIndex[agentId][msg.sender], "index out of bounds");
        require(!feedback[agentId][msg.sender][feedbackIndex].isRevoked, "Already revoked");
        feedback[agentId][msg.sender][feedbackIndex].isRevoked = true;
        emit FeedbackRevoked(agentId, msg.sender, feedbackIndex);
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        return lastIndex[agentId][clientAddress];
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        require(feedbackIndex > 0, "index must be > 0");
        require(feedbackIndex <= lastIndex[agentId][clientAddress], "index out of bounds");
        Feedback storage f = feedback[agentId][clientAddress][feedbackIndex];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.isRevoked);
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return clients[agentId];
    }

    /// The live registry's average: every value scaled to 18 decimals, averaged, and given back in the
    /// most common valueDecimals among the matching feedback. Empty tags match everything.
    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        require(clientAddresses.length > 0, "clientAddresses required");
        bytes32 empty = keccak256("");
        bytes32 t1 = keccak256(bytes(tag1));
        bytes32 t2 = keccak256(bytes(tag2));
        int256 sum;
        uint64[19] memory decimalCounts;
        for (uint256 i; i < clientAddresses.length; i++) {
            uint64 last = lastIndex[agentId][clientAddresses[i]];
            for (uint64 j = 1; j <= last; j++) {
                Feedback storage f = feedback[agentId][clientAddresses[i]][j];
                if (f.isRevoked) continue;
                if (t1 != empty && t1 != keccak256(bytes(f.tag1))) continue;
                if (t2 != empty && t2 != keccak256(bytes(f.tag2))) continue;
                sum += int256(f.value) * int256(10 ** uint256(18 - f.valueDecimals));
                decimalCounts[f.valueDecimals]++;
                count++;
            }
        }
        if (count == 0) return (0, 0, 0);
        uint64 most;
        for (uint8 d; d <= 18; d++) {
            if (decimalCounts[d] > most) {
                most = decimalCounts[d];
                summaryValueDecimals = d;
            }
        }
        summaryValue = int128((sum / int256(uint256(count))) / int256(10 ** uint256(18 - summaryValueDecimals)));
    }

    function getVersion() external pure returns (string memory) {
        return "fallback-2.0.0";
    }
}

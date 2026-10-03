// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AgentRegistry
/// @notice The fallback for the ERC-8004 Identity Registry, for local chains and for a testnet where
/// the live registry is missing or incompatible. The functions the office calls keep the live
/// registry's signatures and events (erc-8004/erc-8004-contracts IdentityRegistryUpgradeable 2.0.0):
/// register (three overloads), setAgentURI, tokenURI, ownerOf, isAuthorizedOrOwner, getMetadata,
/// setMetadata and getAgentWallet. Unlike the live one, ids start at 1, so 0 always means "no agent".
/// It is a bare ERC-721 (no safe transfers, no enumeration). Testnets only: it refuses to deploy on
/// Ethereum or Base mainnet.
contract AgentRegistry {
    error MainnetRefused();
    error NotAuthorized();
    error NonexistentToken(uint256 agentId);
    error ReservedKey();

    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue);
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    string public constant name = "AgentIdentity";
    string public constant symbol = "AGENT";
    bytes32 private constant WALLET_KEY = keccak256("agentWallet");

    uint256 private lastId;
    mapping(uint256 => address) private owners;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => string) private uris;
    mapping(uint256 => mapping(string => bytes)) private metadata;

    constructor() {
        if (block.chainid == 1 || block.chainid == 8453) revert MainnetRefused();
    }

    function register() external returns (uint256 agentId) {
        agentId = mint("");
    }

    function register(string memory agentURI) external returns (uint256 agentId) {
        agentId = mint(agentURI);
    }

    function register(string memory agentURI, MetadataEntry[] memory entries) external returns (uint256 agentId) {
        agentId = mint(agentURI);
        for (uint256 i; i < entries.length; i++) {
            if (keccak256(bytes(entries[i].metadataKey)) == WALLET_KEY) revert ReservedKey();
            metadata[agentId][entries[i].metadataKey] = entries[i].metadataValue;
            emit MetadataSet(agentId, entries[i].metadataKey, entries[i].metadataKey, entries[i].metadataValue);
        }
    }

    function mint(string memory agentURI) private returns (uint256 agentId) {
        agentId = ++lastId;
        owners[agentId] = msg.sender;
        balanceOf[msg.sender]++;
        uris[agentId] = agentURI;
        metadata[agentId]["agentWallet"] = abi.encodePacked(msg.sender);
        emit Transfer(address(0), msg.sender, agentId);
        emit Registered(agentId, agentURI, msg.sender);
        emit MetadataSet(agentId, "agentWallet", "agentWallet", abi.encodePacked(msg.sender));
    }

    function ownerOf(uint256 agentId) public view returns (address owner) {
        owner = owners[agentId];
        if (owner == address(0)) revert NonexistentToken(agentId);
    }

    function tokenURI(uint256 agentId) external view returns (string memory) {
        ownerOf(agentId);
        return uris[agentId];
    }

    function isAuthorizedOrOwner(address spender, uint256 agentId) public view returns (bool) {
        address owner = ownerOf(agentId);
        return spender == owner || isApprovedForAll[owner][spender] || getApproved[agentId] == spender;
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId)) revert NotAuthorized();
        uris[agentId] = newURI;
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory) {
        return metadata[agentId][metadataKey];
    }

    function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId)) revert NotAuthorized();
        if (keccak256(bytes(metadataKey)) == WALLET_KEY) revert ReservedKey();
        metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return address(bytes20(metadata[agentId]["agentWallet"]));
    }

    function approve(address to, uint256 agentId) external {
        address owner = ownerOf(agentId);
        if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert NotAuthorized();
        getApproved[agentId] = to;
        emit Approval(owner, to, agentId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// Hands an identity to someone else (its operator's own wallet, say); the agentWallet is cleared, as the live registry does.
    function transferFrom(address from, address to, uint256 agentId) external {
        if (!isAuthorizedOrOwner(msg.sender, agentId) || ownerOf(agentId) != from || to == address(0)) revert NotAuthorized();
        delete getApproved[agentId];
        balanceOf[from]--;
        balanceOf[to]++;
        owners[agentId] = to;
        metadata[agentId]["agentWallet"] = "";
        emit MetadataSet(agentId, "agentWallet", "agentWallet", "");
        emit Transfer(from, to, agentId);
    }

    function getVersion() external pure returns (string memory) {
        return "fallback-2.0.0";
    }
}

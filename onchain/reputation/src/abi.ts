// The parts of the ERC-8004 Identity and Reputation registries this package calls: the live ones on
// Base Sepolia (erc-8004/erc-8004-contracts, version 2.0.0) and the AgentRegistry and ReputationLog
// fallbacks in contracts/, which keep the same signatures and events.
import { parseAbi } from 'viem';

export const IDENTITY_ABI = parseAbi([
  'function register() returns (uint256 agentId)',
  'function register(string agentURI) returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'function ownerOf(uint256 agentId) view returns (address)',
  'function isAuthorizedOrOwner(address spender, uint256 agentId) view returns (bool)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function getVersion() view returns (string)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
]);

export const REPUTATION_ABI = parseAbi([
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
  'function getClients(uint256 agentId) view returns (address[])',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getIdentityRegistry() view returns (address)',
  'function getVersion() view returns (string)',
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)',
]);

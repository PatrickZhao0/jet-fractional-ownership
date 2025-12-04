// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IOwnershipStaking } from "./interfaces/IOwnershipStaking.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Governance is Ownable {
    IOwnershipStaking public immutable ownershipStaking;

    // all voters can vote on low-tier proposals
    // only high-tier voters (>10% of total staked) can vote on high-tier proposals
    enum ProposalType{
        LOW_TIER,
        HIGH_TIER
    }

    enum ProposalState {
        VOTING,
        REVEALING,
        ADOPED,
        REJECTED,
        ABORTED,
        EXECUTED
    }

    struct Proposal {
        uint256 id;
        string title;
        string descriptionHash;
        uint256 commitEndTimeStamp;
        uint256 revealEndTimeStamp;  
        uint256 yeaVotes;
        uint256 nayVotes;
        uint256 quorum;
        ProposalState state;
        ProposalType proposalType;
    }

    struct VoteCommit {
        bytes32 commit;  // keccak256(proposalId, support, salt, voter)
        bool revealed;
    }

    uint256 public nextProposalId;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteCommit)) public votes; // proposalId => voter => VoteCommit

    event ProposalCreated(
        uint256 indexed id,
        string title
    );
    event VoteCommitted(uint256 indexed proposalId, address indexed voter);
    event VoteRevealed(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 validVotes
    );
    event ProposalFinalized(
        uint256 indexed proposalId,
        ProposalState state
    );
    event ProposalExecuted(uint256 indexed proposalId);

    error CommitDurationTooShort(uint256 attempted);
    error RevealDurationTooShort(uint256 attempted);
    error ProposalNotExists(uint256 proposalId);
    error NotVoted(uint256 proposalId, address voter);
    error CommitPhaseOver(uint256 proposalId);
    error RevealPhaseOver(uint256 proposalId);
    error RevealPhaseNotOver(uint256 proposalId);
    error DoubleCommit(uint256 proposalId, address voter);
    error DoubleReveal(uint256 proposalId, address voter);
    error InvalidReveal(uint256 proposalId, address voter);
    error NoVotingRight(address voter);
    error DoubleFinalize(uint256 proposalId);
    error QuorumNotMet(uint256 proposalId);
    error ProposalNotAdopted(uint256 proposalId);


    constructor(address ownershipStaking_) Ownable(msg.sender) {
        ownershipStaking = IOwnershipStaking(ownershipStaking_);
    }

    modifier proposalExists(uint256 proposalId) {
        if (proposalId >= nextProposalId) revert ProposalNotExists(proposalId);
        _;
    }

    modifier onlyVoted(uint256 proposalId) {
        if (votes[proposalId][msg.sender].commit == bytes32(0)) revert NotVoted(proposalId, msg.sender);
        _;
    }

    modifier withVotingRight(uint256 proposalId) {
        uint256 PERCENT = 1e16;
        IOwnershipStaking.StakeInfo memory stakeInfo = ownershipStaking.getStakeInfo(msg.sender);
        if (!stakeInfo.rights.votable) revert NoVotingRight(msg.sender);
        uint256 votingPower = ownershipStaking.getVotingPower(msg.sender);
        if ((proposals[proposalId].proposalType == ProposalType.HIGH_TIER) && (votingPower < 10 * PERCENT)) revert NoVotingRight(msg.sender);
        _;
    }

    function createProposal(
        string calldata title,
        string calldata descriptionHash,
        uint256 commitDuration,
        uint256 revealDuration,
        uint256 quorum,
        ProposalType proposalType
    ) external onlyOwner {
        if (commitDuration < 1 days) revert CommitDurationTooShort(commitDuration);
        if (revealDuration < 1 days) revert RevealDurationTooShort(revealDuration);

        uint256 id = nextProposalId++;
        uint256 commitEnd = block.timestamp + commitDuration;
        uint256 revealEnd = commitEnd + revealDuration;

        proposals[id] = Proposal({
            id: id,
            title: title,
            descriptionHash: descriptionHash,
            commitEndTimeStamp: commitEnd,
            revealEndTimeStamp: revealEnd,
            yeaVotes: 0,
            nayVotes: 0,
            quorum: quorum,
            state: ProposalState.VOTING,
            proposalType: proposalType
        });

        emit ProposalCreated(id, title);
    }

    function commitVote(uint256 proposalId, bytes32 commit)
        external
        proposalExists(proposalId)
        withVotingRight(proposalId)
    {
        Proposal memory p = proposals[proposalId];
        if (block.timestamp > p.commitEndTimeStamp) revert CommitPhaseOver(proposalId);
        if (votes[proposalId][msg.sender].commit != bytes32(0)) revert DoubleCommit(proposalId, msg.sender);

        votes[proposalId][msg.sender] = VoteCommit({
            commit: commit,
            revealed: false
        });
        emit VoteCommitted(proposalId, msg.sender);
    }

    function revealVote(
        uint256 proposalId,
        bool support,
        uint256 salt
    ) external onlyVoted(proposalId) withVotingRight(proposalId) {
        Proposal storage p = proposals[proposalId];
        if (block.timestamp > p.revealEndTimeStamp) revert RevealPhaseOver(proposalId);

        VoteCommit storage v = votes[proposalId][msg.sender];
        if (v.revealed) revert DoubleReveal(proposalId, msg.sender);

        bytes32 expected = keccak256(
            abi.encodePacked(proposalId, support, salt, msg.sender)
        );
        if (v.commit != expected) revert InvalidReveal(proposalId, msg.sender);

        v.revealed = true;

        uint256 validVotes = ownershipStaking.getStakeInfo(msg.sender).amount;
        if (support) {
            p.yeaVotes += validVotes;
        } else {
            p.nayVotes += validVotes;
        }

        if (p.state != ProposalState.REVEALING) {
            p.state = ProposalState.REVEALING;
        }

        emit VoteRevealed(proposalId, msg.sender, support, validVotes);
    }

    function finalize(uint256 proposalId) external onlyOwner proposalExists(proposalId) {
        Proposal storage p = proposals[proposalId];
        if (block.timestamp < p.revealEndTimeStamp) revert RevealPhaseNotOver(proposalId);
        if (p.state == ProposalState.ADOPED || p.state == ProposalState.REJECTED || p.state == ProposalState.ABORTED || p.state == ProposalState.EXECUTED) 
            revert DoubleFinalize(proposalId);
        
        if (p.yeaVotes + p.nayVotes < p.quorum || p.yeaVotes == p.nayVotes) {
            p.state = ProposalState.ABORTED;
        } else if (p.yeaVotes > p.nayVotes) {
            p.state = ProposalState.ADOPED;
        } else {
            p.state = ProposalState.REJECTED;
        }

        emit ProposalFinalized(
            proposalId,
            p.state
        );
    }

    function execute(uint256 proposalId) external onlyOwner proposalExists(proposalId) {
        Proposal storage p = proposals[proposalId];
        if (p.state != ProposalState.ADOPED) revert ProposalNotAdopted(proposalId);
        p.state = ProposalState.EXECUTED;
        emit ProposalExecuted(proposalId);
    }
}
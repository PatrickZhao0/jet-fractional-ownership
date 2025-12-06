import { expect, should } from "chai";
import { network } from "hardhat";
import { hashMessage } from "ethers";

const { ethers, networkHelpers } = await network.connect();

const PERCENT = 10_000_000_000_000_000n; // 1e16

const ProposalType = {
  LOW_TIER: 0,
  HIGH_TIER: 1,
} as const;

const ProposalState = {
  VOTING: 0,
  REVEALING: 1,
  ADOPED: 2,
  REJECTED: 3,
  ABORTED: 4,
  EXECUTED: 5,
} as const;

const DAYS = 24n * 60n * 60n;

describe("Governance Unit Tests", function () {
  async function initializationFixture() {
    const [deployer, owner, user1, user2, ...extraUsers] =
      await ethers.getSigners();
    const ownershipStaking = await ethers.deployContract(
      "MockOwnershipStaking"
    );
    await ownershipStaking.waitForDeployment();

    const governance = await ethers.deployContract(
      "Governance",
      [ownershipStaking.target],
      owner
    );
    await governance.waitForDeployment();

    return { ownershipStaking, governance, owner, user1, user2, extraUsers };
  }

  async function proposalFixture() {
    const { ownershipStaking, governance, owner, user1, user2, extraUsers } =
      await initializationFixture();
    await governance.createProposal(
      "title",
      hashMessage("description"),
      1n * DAYS,
      1n * DAYS,
      100,
      ProposalType.LOW_TIER
    );
    return { ownershipStaking, governance, owner, user1, user2, extraUsers };
  }

  async function proposalWithHighTierFixture() {
    const { ownershipStaking, governance, owner, user1, user2, extraUsers } =
      await initializationFixture();
    await governance.createProposal(
      "title",
      hashMessage("description"),
      1n * DAYS,
      1n * DAYS,
      100,
      ProposalType.HIGH_TIER
    );
    return { ownershipStaking, governance, owner, user1, user2, extraUsers };
  }

  async function commitVoteFixture() {
    const { ownershipStaking, governance, owner, user1, user2, extraUsers } =
      await proposalFixture();
    await ownershipStaking.setStakeInfo(user1.address, {
      amount: 100n,
      stakedAt: 0n,
      rights: {
        votable: true,
        profitable: false,
        benefitable: false,
      },
    });
    await ownershipStaking.setStakeInfo(user2.address, {
      amount: 100n,
      stakedAt: 0n,
      rights: {
        votable: true,
        profitable: false,
        benefitable: false,
      },
    });
    await governance
      .connect(user1)
      .commitVote(
        0,
        ethers.solidityPackedKeccak256(
          ["uint256", "bool", "uint256", "address"],
          [0, false, 0, user1.address]
        )
      );
    await governance
      .connect(user2)
      .commitVote(
        0,
        ethers.solidityPackedKeccak256(
          ["uint256", "bool", "uint256", "address"],
          [0, true, 0, user2.address]
        )
      );
    return { ownershipStaking, governance, owner, user1, user2, extraUsers };
  }

  describe("createProposal function", function () {
    it("should emit ProposalCreated Event, if someone creates a proposal successfully", async function () {
      const { governance, owner } = await initializationFixture();
      await expect(
        governance.createProposal(
          "title",
          hashMessage("description"),
          1n * DAYS,
          1n * DAYS,
          100,
          ProposalType.LOW_TIER
        )
      ).to.emit(governance, "ProposalCreated");
    });

    it("should raise CommitDurationTooShort Error if commit duration is too short (< 1 day)", async function () {
      const { governance, owner } = await initializationFixture();
      const commitDuration = 1n * DAYS - 1n;
      await expect(
        governance.createProposal(
          "title",
          hashMessage("description"),
          commitDuration,
          1n * DAYS,
          100,
          ProposalType.LOW_TIER
        )
      )
        .to.revertedWithCustomError(governance, "CommitDurationTooShort")
        .withArgs(commitDuration);
    });

    it("should raise RevealDurationTooShort Error if reveal duration is too short (< 1 day)", async function () {
      const { governance } = await initializationFixture();
      const revealDuration = 1n * DAYS - 1n;
      await expect(
        governance.createProposal(
          "title",
          hashMessage("description"),
          1n * DAYS,
          revealDuration,
          100,
          ProposalType.LOW_TIER
        )
      )
        .to.revertedWithCustomError(governance, "RevealDurationTooShort")
        .withArgs(revealDuration);
    });

    it("should initialize Proposal and increment nextProposalId", async function () {
      const { governance, owner } = await initializationFixture();
      const commitDuration = 1n * DAYS;
      const revealDuration = 1n * DAYS;
      const tx = await governance.createProposal(
        "title",
        hashMessage("description"),
        commitDuration,
        revealDuration,
        100,
        ProposalType.LOW_TIER
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber!);
      expect(await governance.nextProposalId()).to.equal(1);
      expect(await governance.proposals(0)).to.deep.equal([
        0n,
        "title",
        hashMessage("description"),
        BigInt(block!.timestamp) + commitDuration,
        BigInt(block!.timestamp) + commitDuration + revealDuration,
        0n,
        0n,
        100n,
        BigInt(ProposalState.VOTING),
        BigInt(ProposalType.LOW_TIER),
      ]);
    });
  });

  describe("commitVote function", function () {
    it("should raise ProposalNotExists Error, if the proposal does not exist", async function () {
      const { governance, ownershipStaking } = await proposalFixture();
      await expect(governance.commitVote(2, hashMessage("some commit")))
        .to.revertedWithCustomError(governance, "ProposalNotExists")
        .withArgs(2);
    });

    it("should raise NoVotingRight Error, if the voter has no voting right", async function () {
      const { governance, ownershipStaking, user1 } = await proposalFixture();
      await ownershipStaking.setStakeInfo(user1.address, {
        amount: 100n,
        stakedAt: 0n,
        rights: {
          votable: false,
          profitable: false,
          benefitable: false,
        },
      });
      await expect(
        governance.connect(user1).commitVote(0, hashMessage("some commit"))
      ).to.revertedWithCustomError(governance, "NoVotingRight");
    });

    it("should raise CommitPhaseOver Error, if the commit phase is over", async function () {
      const { governance, ownershipStaking, user1 } = await proposalFixture();
      await ownershipStaking.setStakeInfo(user1.address, {
        amount: 100n,
        stakedAt: 0n,
        rights: {
          votable: true,
          profitable: false,
          benefitable: false,
        },
      });
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).commitEndTimeStamp + 1n
      );
      await expect(
        governance.connect(user1).commitVote(0, hashMessage("some commit"))
      )
        .to.revertedWithCustomError(governance, "CommitPhaseOver")
        .withArgs(0);
    });

    it("should raise DoubleCommit Error, if the voter has already committed", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await expect(
        governance.connect(user1).commitVote(0, hashMessage("some commit"))
      )
        .to.revertedWithCustomError(governance, "DoubleCommit")
        .withArgs(0, user1.address);
    });

    it("should emit VoteCommitted Event, if someone commits successfully", async function () {
      const { governance, ownershipStaking, user1 } = await proposalFixture();
      await ownershipStaking.setStakeInfo(user1.address, {
        amount: 100n,
        stakedAt: 0n,
        rights: {
          votable: true,
          profitable: false,
          benefitable: false,
        },
      });
      await expect(
        governance.connect(user1).commitVote(0, hashMessage("some commit"))
      )
        .to.emit(governance, "VoteCommitted")
        .withArgs(0, user1.address);
    });

    it("should not allow low-tier voters to vote on high-tier proposals", async function () {
      const { governance, ownershipStaking, user1 } =
        await proposalWithHighTierFixture();
      await ownershipStaking.setStakeInfo(user1.address, {
        amount: 100n,
        stakedAt: 0n,
        rights: {
          votable: true,
          profitable: false,
          benefitable: false,
        },
      });
      await ownershipStaking.setVotingPower(user1.address, 9n * PERCENT);
      await expect(
        governance.connect(user1).commitVote(0, hashMessage("some commit"))
      ).to.revertedWithCustomError(governance, "NoVotingRight");
    });

    it("should not allow low-tier voters to vote on high-tier proposals", async function () {
      const { governance, ownershipStaking, user1 } =
        await proposalWithHighTierFixture();
      await ownershipStaking.setStakeInfo(user1.address, {
        amount: 100n,
        stakedAt: 0n,
        rights: {
          votable: true,
          profitable: false,
          benefitable: false,
        },
      });
      await ownershipStaking.setVotingPower(user1.address, 11n * PERCENT);
      await expect(
        governance.connect(user1).commitVote(0, hashMessage("some commit"))
      ).to.not.revertedWithCustomError(governance, "NoVotingRight");
    });

    describe("mapping: votes", function () {
      it("should register the VoteCommit of the voter", async function () {
        const { governance, user1 } = await commitVoteFixture();
        expect((await governance.votes(0, user1.address)).commit).to.equal(
          ethers.solidityPackedKeccak256(
            ["uint256", "bool", "uint256", "address"],
            [0, false, 0, user1.address]
          )
        );
        expect((await governance.votes(0, user1.address)).revealed).to.equal(
          false
        );
      });
    });
  });

  describe("revealVote function", function () {
    it("should raise NotVoted Error, if the voter has not voted", async function () {
      const { governance, user1 } = await proposalFixture();
      await expect(
        governance.connect(user1).revealVote(0, true, 0)
      ).to.revertedWithCustomError(governance, "NotVoted");
    });

    it("should raise NoVotingRight Error, if the voter has no voting right when revealVote", async function () {
      const { ownershipStaking, governance, user1 } = await commitVoteFixture();
      await ownershipStaking.setStakeInfo(user1.address, {
        amount: 100000n,
        stakedAt: 0n,
        rights: {
          votable: false,
          profitable: false,
          benefitable: false,
        },
      });
      await expect(
        governance.connect(user1).revealVote(0, true, 0)
      ).to.revertedWithCustomError(governance, "NoVotingRight");
    });

    it("should raise RevealPhaseOver Error, if the reveal phase is over", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await expect(
        governance.connect(user1).revealVote(0, true, 0)
      ).to.revertedWithCustomError(governance, "RevealPhaseOver");
    });

    it("should raise InvalidReveal Error, if the reveal is invalid", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await expect(governance.connect(user1).revealVote(0, true, 0))
        .to.revertedWithCustomError(governance, "InvalidReveal")
        .withArgs(0, user1.address);
    });

    it("should raise DoubleReveal Error, if the voter has already revealed", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await governance.connect(user1).revealVote(0, false, 0);
      await expect(governance.connect(user1).revealVote(0, false, 0))
        .to.revertedWithCustomError(governance, "DoubleReveal")
        .withArgs(0, user1.address);
    });

    it("should emit VoteRevealed Event, if someone reveals successfully", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await expect(governance.connect(user1).revealVote(0, false, 0))
        .to.emit(governance, "VoteRevealed")
        .withArgs(0, user1.address, false, 100);
    });

    describe("mapping: votes", function () {
      it("should set caller's VoteCommit.revealed to true, if caller reveals successfully", async function () {
        const { governance, user1 } = await commitVoteFixture();
        await governance.connect(user1).revealVote(0, false, 0);
        expect((await governance.votes(0, user1.address)).revealed).to.equal(
          true
        );
      });
    });

    describe("mapping: proposals", function () {
      it("should update yeaVotes and nayVotes, if someone reveals successfully", async function () {
        const { ownershipStaking, governance, user1 } =
          await commitVoteFixture();
        await governance.connect(user1).revealVote(0, false, 0);
        expect((await governance.proposals(0)).yeaVotes).to.equal(0);
        expect((await governance.proposals(0)).nayVotes).to.equal(100);
      });

      it("should update state to REVEALING, if someone reveals successfully", async function () {
        const { governance, user1 } = await commitVoteFixture();
        await governance.connect(user1).revealVote(0, false, 0);
        expect((await governance.proposals(0)).state).to.equal(
          ProposalState.REVEALING
        );
      });
    });
  });

  describe("finalize function", function () {
    it("should raise RevealPhaseNotOver Error, if the reveal phase is not over", async function () {
      const { governance } = await commitVoteFixture();
      await expect(governance.finalize(0)).to.revertedWithCustomError(
        governance,
        "RevealPhaseNotOver"
      );
    });

    it("should raise DoubleFinalize Error, if the proposal has already been finalized", async function () {
      const { governance } = await commitVoteFixture();
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      await expect(governance.finalize(0)).to.revertedWithCustomError(
        governance,
        "DoubleFinalize"
      );
    });

    it("should set Proposal.state to ABORTED, if the quorum is not met", async function () {
      const { governance } = await commitVoteFixture();
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      expect((await governance.proposals(0)).state).to.equal(
        ProposalState.ABORTED
      );
    });

    it("should set Proposal.state to ABORTED, if the nayVotes equals yeaVotes", async function () {
      const { governance, user1, user2 } = await commitVoteFixture();
      await governance.connect(user1).revealVote(0, false, 0);
      await governance.connect(user2).revealVote(0, true, 0);
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      expect((await governance.proposals(0)).state).to.equal(
        ProposalState.ABORTED
      );
    });

    it("should set Proposal.state to REJECTED, if the nayVotes is greater than yeaVotes", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await governance.connect(user1).revealVote(0, false, 0);
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      expect((await governance.proposals(0)).state).to.equal(
        ProposalState.REJECTED
      );
    });

    it("should set Proposal.state to ADOPED, if the yeaVotes is greater than nayVotes", async function () {
      const { governance, user2 } = await commitVoteFixture();
      await governance.connect(user2).revealVote(0, true, 0);
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      expect((await governance.proposals(0)).state).to.equal(
        ProposalState.ADOPED
      );
    });
  });

  describe("execute function", function () {
    it("should raise ProposalNotAdopted Error, if the proposal is not adopted", async function () {
      const { governance } = await commitVoteFixture();
      await expect(governance.execute(0)).to.revertedWithCustomError(
        governance,
        "ProposalNotAdopted"
      );
    });

    it("should raise ProposalNotAdopted Error, if the proposal is not ADOPTED", async function () {
      const { governance, user1 } = await commitVoteFixture();
      await governance.connect(user1).revealVote(0, false, 0);
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      await expect(governance.execute(0))
        .to.revertedWithCustomError(governance, "ProposalNotAdopted")
        .withArgs(0);
    });

    it("should emit ProposalExecuted Event, if the proposal is adopted", async function () {
      const { governance, user2 } = await commitVoteFixture();
      await governance.connect(user2).revealVote(0, true, 0);
      await networkHelpers.time.increaseTo(
        (await governance.proposals(0)).revealEndTimeStamp + 1n
      );
      await governance.finalize(0);
      await expect(governance.execute(0))
        .to.emit(governance, "ProposalExecuted")
        .withArgs(0);
    });
  });
});

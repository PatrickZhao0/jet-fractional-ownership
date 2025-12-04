import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const PERCENT = 10_000_000_000_000_000n;
const TEN_DAYS = 10n * 24n * 60n * 60n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;
const SIXTY_DAYS = 60n * 24n * 60n * 60n;
const NINETY_DAYS = 90n * 24n * 60n * 60n;

describe("OwnershipStaking Unit Tests", function () {
  /*
  Fixtures
   */
  async function initializationFixture() {
    const [JETOdeployer, owner, user1, user2, ...extraUsers] =
      await ethers.getSigners();
    const JETO = await ethers.deployContract("MockJETO");
    await JETO.waitForDeployment();

    const ownershipStaking = await ethers.deployContract(
      "OwnershipStaking",
      [JETO.target],
      owner
    );
    await ownershipStaking.waitForDeployment();

    //mint initial tokens for user1
    await JETO.mint(user1.address, 100n);
    await JETO.connect(user1).approve(ownershipStaking.target, 100n);

    return { ownershipStaking, JETO, owner, user1, user2, extraUsers };
  }

  async function stakedFixture() {
    const { ownershipStaking, JETO, owner, user1, user2 } =
      await networkHelpers.loadFixture(initializationFixture);
    await JETO.mint(user2.address, 100n);
    await JETO.connect(user2).approve(ownershipStaking.target, 100n);
    await Promise.all([
      ownershipStaking.connect(user1).stake(100n),
      ownershipStaking.connect(user2).stake(100n),
    ]);
    return { ownershipStaking, JETO, owner, user1, user2 };
  }

  /* 
  Tests
   */
  describe("getter functions", function () {
    describe("getStakeInfo", function () {
      it("should return the staked info of the address", async function () {
        const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
          stakedFixture
        );
        const info = await ownershipStaking.getStakeInfo(user1.address);
        expect(info.amount).to.equal(100n);
        expect(info.stakedAt).to.be.greaterThan(0n);
        expect(info.rights.votable).to.equal(false);
        expect(info.rights.profitable).to.equal(false);
        expect(info.rights.benefitable).to.equal(false);
      });
    });

    describe("getVotingPower", function () {
      it("should return the voting power of the address", async function () {
        const { ownershipStaking, user1, user2 } =
          await networkHelpers.loadFixture(stakedFixture);
        expect(await ownershipStaking.getVotingPower(user1.address)).to.equal(
          50n * PERCENT
        );
        expect(await ownershipStaking.getVotingPower(user2.address)).to.equal(
          50n * PERCENT
        );
      });
    });

    describe("getRights", function () {
      it("should return the rights info of the address", async function () {
        const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
          stakedFixture
        );
        const rights = await ownershipStaking.getRights(user1.address);
        expect(rights.votable).to.equal(false);
        expect(rights.profitable).to.equal(false);
        expect(rights.benefitable).to.equal(false);
      });
    });
  });

  describe("stake function", function () {
    describe("variable: totalStaked", function () {
      it("should be equal to 0, if no one stakes", async function () {
        const { ownershipStaking } = await networkHelpers.loadFixture(
          initializationFixture
        );
        expect(await ownershipStaking.totalStaked()).to.equal(0n);
      });

      it("should be equal to the new total staked amount, after someone stakes", async function () {
        const { ownershipStaking, JETO, user1, user2 } =
          await networkHelpers.loadFixture(initializationFixture);

        await JETO.mint(user2.address, 100n);
        await JETO.connect(user2).approve(ownershipStaking.target, 100n);
        await Promise.all([
          ownershipStaking.connect(user1).stake(100n),
          ownershipStaking.connect(user2).stake(100n),
        ]);
        expect(await ownershipStaking.totalStaked()).to.equal(200n);
      });
    });

    it("should emit Staked Event, if someone stakes successfully", async function () {
      const { ownershipStaking, JETO, user1 } =
        await networkHelpers.loadFixture(initializationFixture);
      await expect(ownershipStaking.connect(user1).stake(100n))
        .to.emit(ownershipStaking, "Staked")
        .withArgs(user1.address, 100n);
    });

    it("should increment StakeInfo.amount by the new stake amount", async function () {
      const { ownershipStaking, JETO, user1 } =
        await networkHelpers.loadFixture(initializationFixture);
      await JETO.mint(user1.address, 100n);
      await JETO.connect(user1).approve(ownershipStaking.target, 100n);
      await ownershipStaking.connect(user1).stake(100n);
      expect(
        (await ownershipStaking.connect(user1).getStakeInfo(user1.address))
          .amount
      ).to.equal(100n);
      expect(
        (await ownershipStaking.connect(user1).getStakeInfo(user1.address))
          .stakedAt
      ).to.not.equal(0);
    });

    it("should update StakeInfo.stakedAt using weighted-average timestamp after additional staking", async function () {
      const { JETO, ownershipStaking, user1 } =
        await networkHelpers.loadFixture(stakedFixture);

      const addedAmount = 100n;
      await JETO.mint(user1.address, addedAmount);
      await JETO.connect(user1).approve(ownershipStaking.target, addedAmount);

      const stakedAtBefore = (
        await ownershipStaking.connect(user1).getStakeInfo(user1.address)
      ).stakedAt;
      const oldAmount = (
        await ownershipStaking.connect(user1).getStakeInfo(user1.address)
      ).amount;

      const tx = await ownershipStaking.connect(user1).stake(addedAmount);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber!);
      const timestampAfterStake = BigInt(block!.timestamp);

      const expectedStakedAt =
        (oldAmount * stakedAtBefore + addedAmount * timestampAfterStake) /
        (oldAmount + addedAmount);

      const stakedAtAfter = (
        await ownershipStaking.connect(user1).getStakeInfo(user1.address)
      ).stakedAt;

      expect(stakedAtAfter).to.be.greaterThan(stakedAtBefore);
      expect(stakedAtAfter).to.equal(expectedStakedAt);
    });

    it("should transfer the staked amount to the contract", async function () {
      const { ownershipStaking, JETO, user1 } =
        await networkHelpers.loadFixture(initializationFixture);
      await ownershipStaking.connect(user1).stake(100n);
      expect(await JETO.balanceOf(ownershipStaking.target)).to.equal(100n);
      expect(await JETO.balanceOf(user1.address)).to.equal(0n);
    });

    it("should revert if user JETO token balance is not enough", async function () {
      const { ownershipStaking, JETO, user1 } =
        await networkHelpers.loadFixture(initializationFixture);
      // user1 only has 100 JETO
      await expect(ownershipStaking.connect(user1).stake(200n)).to.revert(
        ethers
      );
    });

    it("should raise NonPositiveAmount Error if stake amount is not positive", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        initializationFixture
      );
      await expect(
        ownershipStaking.connect(user1).stake(0n)
      ).to.revertedWithCustomError(ownershipStaking, "NonPositiveAmount");
    });
  });

  describe("unstake function", function () {
    describe("variable: totalStaked", function () {
      it("should be equal to the new total staked amount, after someone unstakes", async function () {
        const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
          stakedFixture
        );
        expect(await ownershipStaking.totalStaked()).to.equal(200n);
        await ownershipStaking.connect(user1).unstake(100n);
        expect(await ownershipStaking.totalStaked()).to.equal(100n);
      });
    });

    it("should emit Unstaked Event, if someone unstakes successfully", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await expect(ownershipStaking.connect(user1).unstake(100n))
        .to.emit(ownershipStaking, "UnStaked")
        .withArgs(user1.address, 100n);
    });

    it("should decrement StakeInfo.amount by the unstake amount", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await ownershipStaking.connect(user1).unstake(100n);
      expect(
        (await ownershipStaking.connect(user1).getStakeInfo(user1.address))
          .amount
      ).to.equal(0n);
    });

    it("should not affect StakeInfo.stakedAt if the caller did not completely unstakes", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );

      const stakedAtBeforeUnstaked = (
        await ownershipStaking.connect(user1).getStakeInfo(user1.address)
      ).stakedAt;

      await ownershipStaking.connect(user1).unstake(99n);
      expect(
        (await ownershipStaking.connect(user1).getStakeInfo(user1.address))
          .stakedAt
      ).to.equal(stakedAtBeforeUnstaked);
    });

    it("should reset StakeInfo.stakedAt if the caller completely unstakes", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );

      await ownershipStaking.connect(user1).unstake(100n);
      expect(
        (await ownershipStaking.connect(user1).getStakeInfo(user1.address))
          .stakedAt
      ).to.equal(0);
    });

    it("should transfer the unstaked amount to the caller", async function () {
      const { ownershipStaking, user1, JETO } =
        await networkHelpers.loadFixture(stakedFixture);
      await ownershipStaking.connect(user1).unstake(100n);
      expect(await JETO.balanceOf(user1.address)).to.equal(100n);
      expect(await JETO.balanceOf(ownershipStaking.target)).to.equal(100n);
    });

    it("should raise InsufficientStake Error if the unstake amount is greater than the staked amount", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await expect(
        ownershipStaking.connect(user1).unstake(200n)
      ).to.revertedWithCustomError(ownershipStaking, "InsufficientStake");
    });

    it("should raise NonPositiveAmount Error if unstake amount is not positive", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await expect(
        ownershipStaking.connect(user1).unstake(0n)
      ).to.revertedWithCustomError(ownershipStaking, "NonPositiveAmount");
    });
  });

  describe("claimRights Function", function () {
    it("should emit RightsClaimed Event, if someone claims rights successfully", async function () {
      const { ownershipStaking, user1, user2 } =
        await networkHelpers.loadFixture(stakedFixture);
      await expect(ownershipStaking.connect(user1).claimRights())
        .to.emit(ownershipStaking, "RightsClaimed")
        .withArgs(user1.address, [false, false, false]);
    });

    it("should unlock no rights, with effective staking less than 30 days", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await networkHelpers.time.increase(TEN_DAYS);
      await ownershipStaking.connect(user1).claimRights();
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address)).votable
      ).to.equal(false);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .profitable
      ).to.equal(false);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .benefitable
      ).to.equal(false);
    });

    it("should unlock voting right only, after effective staking for 30 days", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await networkHelpers.time.increase(THIRTY_DAYS);
      await ownershipStaking.connect(user1).claimRights();
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address)).votable
      ).to.equal(true);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .profitable
      ).to.equal(false);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .benefitable
      ).to.equal(false);
    });

    it("should unlock voting and profiting rights only, after effective staking for 60 days", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await networkHelpers.time.increase(SIXTY_DAYS);
      await ownershipStaking.connect(user1).claimRights();
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address)).votable
      ).to.equal(true);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .profitable
      ).to.equal(true);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .benefitable
      ).to.equal(false);
    });

    it("should unlock all voting, profiting, benefiting rights, after effective staking for 90 days", async function () {
      const { ownershipStaking, user1 } = await networkHelpers.loadFixture(
        stakedFixture
      );
      await networkHelpers.time.increase(NINETY_DAYS);
      await ownershipStaking.connect(user1).claimRights();
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address)).votable
      ).to.equal(true);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .profitable
      ).to.equal(true);
      expect(
        (await ownershipStaking.connect(user1).getRights(user1.address))
          .benefitable
      ).to.equal(true);
    });
  });
});

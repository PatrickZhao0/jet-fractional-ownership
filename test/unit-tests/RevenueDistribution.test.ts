import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();

describe("Revenue Distribution Tests", function () {

  // --- Fixture: Setup Full Environment ---
  async function deployRevenueFixture() {
    const [owner, alice, bob, customer, attacker] = await ethers.getSigners();

    // 1. Deploy Tokens
    const MockToken = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockToken.deploy();
    const jetO = await MockToken.deploy(); // Staking Token
    await usdt.waitForDeployment();
    await jetO.waitForDeployment();

    // 2. Deploy Staking
    const Staking = await ethers.getContractFactory("OwnershipStaking");
    const staking = await Staking.deploy(jetO.target);
    await staking.waitForDeployment();

    // 3. Deploy Revenue
    const Revenue = await ethers.getContractFactory("RevenueDistribution");
    const revenue = await Revenue.deploy(usdt.target, staking.target);
    await revenue.waitForDeployment();

    // 4. Deploy JetU
    const initialPrice = 1n;
    const JetU = await ethers.getContractFactory("JetUtilityToken");
    const jetU = await JetU.deploy(owner.address, usdt.target, initialPrice);
    await jetU.waitForDeployment();

    // 5. Setup Connections
    await jetU.connect(owner).setRevenueContract(revenue.target);

    // 6. Fund Preparation
    await jetO.mint(alice.address, 1000n);
    await jetO.mint(bob.address, 1000n);
    await usdt.mint(customer.address, 10000n);
    
    // Mint USDT to JetU to simulate accumulated revenue
    await usdt.mint(jetU.target, 5000n);

    // 7. Approve Staking
    await jetO.connect(alice).approve(staking.target, 1000n);
    await jetO.connect(bob).approve(staking.target, 1000n);

    return { 
      usdt, jetO, jetU, staking, revenue, 
      owner, alice, bob, customer, attacker 
    };
  }

  // --- Fixture: Setup Mock Environment (No Time Delay) ---
  async function deployMockFixture() {
    const [owner, alice, bob, attacker] = await ethers.getSigners();

    // 1. Deploy USDT
    const MockToken = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockToken.deploy();
    await usdt.waitForDeployment();

    // 2. Deploy MockOwnershipStaking
    const MockOwnershipStaking = await ethers.getContractFactory("MockOwnershipStaking");
    const staking = await MockOwnershipStaking.deploy() as any;
    await staking.waitForDeployment();

    // 3. Deploy Revenue (Connected to MockOwnershipStaking)
    const Revenue = await ethers.getContractFactory("RevenueDistribution");
    const revenue = await Revenue.deploy(usdt.target, staking.target);
    await revenue.waitForDeployment();

    // 4. Set Mock States (God Mode)
    // Alice: Staked 100, Profitable = true
    await staking.setMockData(alice.address, 100n, true);
    
    // Bob: Staked 100, Profitable = false
    await staking.setMockData(bob.address, 100n, false);

    // 5. Fund Preparation
    return { usdt, staking, revenue, owner, alice, bob, attacker };
  }

  type FixtureType = Awaited<ReturnType<typeof deployRevenueFixture>>;


  // 1. Function: depositRevenue
  describe("depositRevenue", function () {
    
    // Happy Path: Successful Deposit
    it("Should accept USDT, transfer funds, and emit event", async function () {
      const { revenue, usdt, alice } = await networkHelpers.loadFixture(deployMockFixture);

      const amount = 1000n;

      // Preparation:
      // 1. Mint USDT to Alice
      await usdt.mint(alice.address, amount);
      // 2. Alice must approve Revenue contract
      await usdt.connect(alice).approve(revenue.target, amount);

      // Verify initial balance
      expect(await usdt.balanceOf(revenue.target)).to.equal(0n);

      // Execute deposit
      // Verify event emission
      await expect(revenue.connect(alice).depositRevenue(amount))
        .to.emit(revenue, "RevenueDeposited")
        .withArgs(amount);

      // Verify contract balance increased
      expect(await usdt.balanceOf(revenue.target)).to.equal(amount);
      // Verify user balance decreased
      expect(await usdt.balanceOf(alice.address)).to.equal(0n);
    });

    // 2. Early Return: Amount is 0
    it("Should return early if amount is 0 (No event, No transfer)", async function () {
      const { revenue, alice, usdt } = await networkHelpers.loadFixture(deployMockFixture);

      // Should return early without error or event
      await expect(revenue.connect(alice).depositRevenue(0n))
        .to.not.emit(revenue, "RevenueDeposited");
      
      // Balance should remain unchanged
      expect(await usdt.balanceOf(revenue.target)).to.equal(0n);
    });

    // 3. Failure Case: No Approval
    it("Should revert if user did not approve USDT", async function () {
      const { revenue, alice, usdt } = await networkHelpers.loadFixture(deployMockFixture);
      
      const amount = 100n;
      await usdt.mint(alice.address, amount); 

      // No approval, expect ERC20InsufficientAllowance
      await expect(revenue.connect(alice).depositRevenue(amount))
        .to.be.revertedWithCustomError(usdt, "ERC20InsufficientAllowance");
    });

    // 4. Failure Case: Insufficient Balance
    it("Should revert if user has no USDT", async function () {
      const { revenue, alice, usdt } = await networkHelpers.loadFixture(deployMockFixture);
      
      const amount = 100n;
      await usdt.connect(alice).approve(revenue.target, amount); // Approved

      // No funds, expect ERC20InsufficientBalance
      await expect(revenue.connect(alice).depositRevenue(amount))
        .to.be.revertedWithCustomError(usdt, "ERC20InsufficientBalance");
    });

    it("Should revert with TransferFailed using MockBadToken", async function () {
      const [owner, alice] = await ethers.getSigners();

      // 1. Deploy BadToken
      const MockBadToken = await ethers.getContractFactory("MockBadToken");
      const badToken = await MockBadToken.deploy();
      await badToken.waitForDeployment();

      // 2. Deploy Revenue with BadToken
      // (Staking address is irrelevant here)
      const Revenue = await ethers.getContractFactory("RevenueDistribution");
      const badRevenue = await Revenue.deploy(badToken.target, owner.address); 
      await badRevenue.waitForDeployment();

      // 3. Attempt Deposit
      // Expect: badToken.transferFrom returns false -> Revenue reverts with TransferFailed
      await expect(badRevenue.connect(alice).depositRevenue(100n))
        .to.be.revertedWithCustomError(badRevenue, "TransferFailed");
    });

  });


  // 2. Function: startNewRound
  describe("startNewRound", function () {
    
    // 1. Permission Check (Unhappy Path)
    it("Should revert if non-owner tries to start round", async function () {
      const { revenue, attacker } = await networkHelpers.loadFixture(deployMockFixture);
      
      await expect(revenue.connect(attacker).startNewRound())
        .to.be.revertedWithCustomError(revenue, "OwnableUnauthorizedAccount");
    });

    // 2. Logic Check: No Stakers (Unhappy Path)
    it("Should revert if totalStaked is 0 (No Stakers)", async function () {
      const { revenue, owner, staking, alice, bob } = await networkHelpers.loadFixture(deployMockFixture);

      // Clear all stakes to simulate no stakers
      await staking.setMockData(alice.address, 0n, true);
      await staking.setMockData(bob.address, 0n, false);

      // Expect NoStakers error
      await expect(revenue.connect(owner).startNewRound())
        .to.be.revertedWithCustomError(revenue, "NoStakers");
    });

    // 3. Success (Happy Path)
    it("Should calculate reward correctly and activate new round", async function () {
      const { revenue, owner, usdt } = await networkHelpers.loadFixture(deployMockFixture);

      // --- Preparation ---
      // 1. Inject funds
      const revenueAmount = 1000n;
      await usdt.mint(revenue.target, revenueAmount);

      // 2. Confirm total staked
      // Alice(100) + Bob(100) = 200
      const totalStaked = 200n;

      // --- Expected Calculation ---
      // Formula: (Balance * 1e12) / TotalStaked
      // Expected RPS = 5e12
      const expectedRPS = (revenueAmount * 1000000000000n) / totalStaked;

      // --- Execution & Verification ---
      // Verify event arguments
      await expect(revenue.connect(owner).startNewRound())
        .to.emit(revenue, "RoundStarted")
        .withArgs(1n, revenueAmount, expectedRPS);

      // Verify state updates
      expect(await revenue.currentRoundIndex()).to.equal(1n); // Round index incremented
      expect(await revenue.isRoundActive()).to.be.true;       // Active status
      expect(await revenue.currentRoundRewardPerShare()).to.equal(expectedRPS); // RPS updated
    });

    describe("variable : currentRoundIndex", function () {
      it("Should increment currentRoundIndex", async function () {
        const { revenue, owner, usdt } = await networkHelpers.loadFixture(deployMockFixture);

        // Prepare funds
        await usdt.mint(revenue.target, 1000n);

        // Verify initial value
        expect(await revenue.currentRoundIndex()).to.equal(0n);

        // Execute
        await revenue.connect(owner).startNewRound();

        // Verify result
        expect(await revenue.currentRoundIndex()).to.equal(1n);
      });
    });

    describe("variable : currentRoundRewardPerShare", function () {
      it("Should calculate and update currentRoundRewardPerShare correctly", async function () {
        const { revenue, owner, usdt } = await networkHelpers.loadFixture(deployMockFixture);

        // Prepare: 1000 USDT
        const revenueAmount = 1000n;
        await usdt.mint(revenue.target, revenueAmount);

        // Prepare: Total Staked = 200
        const totalStaked = 200n;

        // Expected RPS = 5e12
        const expectedRPS = (revenueAmount * 1000000000000n) / totalStaked;

        // Verify initial value
        expect(await revenue.currentRoundRewardPerShare()).to.equal(0n);

        // Execute
        await revenue.connect(owner).startNewRound();

        // Verify result
        expect(await revenue.currentRoundRewardPerShare()).to.equal(expectedRPS);
      });
    });

    describe("variable : isRoundActive", function () {
      it("Should set isRoundActive to true", async function () {
        const { revenue, owner, usdt } = await networkHelpers.loadFixture(deployMockFixture);

        await usdt.mint(revenue.target, 1000n);

        // Verify initial value
        expect(await revenue.isRoundActive()).to.be.false;

        // Execute
        await revenue.connect(owner).startNewRound();

        // Verify result
        expect(await revenue.isRoundActive()).to.be.true;
      });
    });

  });


  // 3. Function: claim
  describe("Claim", function () {
    
    it("Should revert if round is not active (Round Not Started)", async function () {
      const { revenue, alice } = await networkHelpers.loadFixture(deployMockFixture);

      // Note: Do not start round
      // Expect RoundNotActive error
      await expect(revenue.connect(alice).claim())
        .to.be.revertedWithCustomError(revenue, "RoundNotActive");
    });

    it("Should allow claim if user is Profitable", async function () {
      const { revenue, owner, alice, usdt } = await networkHelpers.loadFixture(deployMockFixture);

      // 1. Start Round
      // Total Staked = 200, Pool = 1000
      await usdt.mint(revenue.target, 1000n)
      await revenue.connect(owner).startNewRound();

      // 2. Alice Claims
      // Alice is Profitable, should succeed
      // Expected: 500
      await expect(revenue.connect(alice).claim())
        .to.emit(revenue, "RewardClaimed")
        .withArgs(alice.address, 500n);

      // Verify balance
      expect(await usdt.balanceOf(alice.address)).to.equal(500n);
    });

    it("Should revert if user is NOT Profitable", async function () {
      const { revenue, owner, bob, usdt } = await networkHelpers.loadFixture(deployMockFixture);
      await usdt.mint(revenue.target, 1000n)
      // 1. Start Round
      await revenue.connect(owner).startNewRound();

      // 2. Bob Claims
      // Bob is not profitable, should fail
      await expect(revenue.connect(bob).claim())
        .to.be.revertedWithCustomError(revenue, "NotProfitableYet");
    });

    it("Should handle state changes dynamically", async function () {
      const { revenue, staking, bob, owner, usdt } = await networkHelpers.loadFixture(deployMockFixture);
      await usdt.mint(revenue.target, 1000n)
      await revenue.connect(owner).startNewRound();

      // 1. Bob cannot claim yet
      await expect(revenue.connect(bob).claim()).to.be.revertedWithCustomError(revenue, "NotProfitableYet");

      // 2. Set Bob to Profitable
      await staking.setMockData(bob.address, 100n, true);

      // 3. Bob can now claim
      await expect(revenue.connect(bob).claim())
        .to.emit(revenue, "RewardClaimed")
        .withArgs(bob.address, 500n);
    });

    it("Should revert if user tries to claim twice in the same round", async function () {
      // 1. Load Mock environment
      const { revenue, staking, jetU, alice, owner, usdt } = await networkHelpers.loadFixture(deployMockFixture);

      // 2. Set Alice state
      await staking.setMockData(alice.address, 100n, true);

      // 3. Prepare Pool
      await usdt.mint(revenue.target, 1000n);
      await revenue.connect(owner).startNewRound();

      // 4. First Claim (Success)
      await expect(revenue.connect(alice).claim())
        .to.emit(revenue, "RewardClaimed");

      // 5. Second Claim (Fail)
      await expect(revenue.connect(alice).claim())
        .to.be.revertedWithCustomError(revenue, "AlreadyClaimedThisRound");
    });

    it("Should revert with TransferFailed when using Invalid Token (return false)", async function () {
      const [owner, alice] = await ethers.getSigners();

      // Deploy BadToken
      const MockBadToken = await ethers.getContractFactory("MockBadToken");
      const badToken = await MockBadToken.deploy();
      await badToken.waitForDeployment();

      // Deploy Revenue with BadToken
      const Revenue = await ethers.getContractFactory("RevenueDistribution");
      const badRevenue = await Revenue.deploy(badToken.target, owner.address);
      await badRevenue.waitForDeployment();

      // Execute Test
      // badToken returns false -> revert TransferFailed
      await expect(badRevenue.connect(alice).depositRevenue(100n))
        .to.be.revertedWithCustomError(badRevenue, "TransferFailed");
    });

  });


  // 4. View Function: checkCurrentRoundReward
  describe("checkCurrentRoundReward", function () {
    
    // 1. Happy Path: Check Reward
    it("Should return correct amount for a profitable user in an active round", async function () {
      const { revenue, owner, alice, bob, usdt, staking } = await networkHelpers.loadFixture(deployMockFixture);

      // Set Bob's stake to 0
      await staking.setMockData(bob.address, 0n, false);

      // A. Set Alice: 100 staked, profitable
      await staking.setMockData(alice.address, 100n, true);

      // B. Prepare funds and start round
      await usdt.mint(revenue.target, 1000n);
      await revenue.connect(owner).startNewRound();

      // C. Check
      // Expected: 1000
      const reward = await revenue.checkCurrentRoundReward(alice.address);
      expect(reward).to.equal(1000n);
    });

    // 2. Round Not Active
    it("Should return 0 if round is not active", async function () {
      const { revenue, alice, staking, usdt } = await networkHelpers.loadFixture(deployMockFixture);

      // Alice eligible, funds available
      await staking.setMockData(alice.address, 100n, true);
      await usdt.mint(revenue.target, 1000n);

      // Round not started
      const reward = await revenue.checkCurrentRoundReward(alice.address);
      expect(reward).to.equal(0n);
    });

    // 3. User Not Profitable
    it("Should return 0 if user is not profitable", async function () {
      const { revenue, owner, bob, usdt, staking } = await networkHelpers.loadFixture(deployMockFixture);

      // Bob: 100 staked, not profitable
      await staking.setMockData(bob.address, 100n, false);

      // Start round
      await usdt.mint(revenue.target, 1000n);
      await revenue.connect(owner).startNewRound();

      // Check
      const reward = await revenue.checkCurrentRoundReward(bob.address);
      expect(reward).to.equal(0n);
    });

    // 4. Already Claimed
    it("Should return 0 if user has already claimed this round", async function () {
      const { revenue, owner, alice, bob, usdt, staking } = await networkHelpers.loadFixture(deployMockFixture);

      // Exclude Bob
      await staking.setMockData(bob.address, 0n, false);

      await staking.setMockData(alice.address, 100n, true);
      await usdt.mint(revenue.target, 1000n);
      await revenue.connect(owner).startNewRound();

      // First check: 1000
      expect(await revenue.checkCurrentRoundReward(alice.address)).to.equal(1000n);

      // Execute claim
      await revenue.connect(alice).claim();

      // Second check: 0
      expect(await revenue.checkCurrentRoundReward(alice.address)).to.equal(0n);
    });

  });
});
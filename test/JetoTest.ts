import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("JetOToken Unit Tests", function () {

  async function deployJETOFixture() {
    const [owner, user1, user2, nonOwner] = await ethers.getSigners();

    const JetOTokenFactory = await ethers.getContractFactory("JetOToken");
    const jetToken = await JetOTokenFactory.deploy(owner.address);
    await jetToken.waitForDeployment();

    // 添加 owner 和 user1 的 KYC，用于测试
    await jetToken.connect(owner).addKYC([owner.address, user1.address]);

    return { jetToken, owner, user1, user2, nonOwner };
  }

  // --- Token metadata ---
  describe("Decimal function", function () {
    it("Should have 3 decimals", async function () {
      const { jetToken } = await deployJETOFixture();
      expect(await jetToken.decimals()).to.equal(3);
    });
  });

  // --- Minting ---
  describe("Mint function", function () {
    it("Owner should be able to mint tokens to KYC addresses", async function () {
      const { jetToken, owner } = await deployJETOFixture();

      const mintAmount = 500n;
      const balanceBefore = await jetToken.balanceOf(owner.address);
      const totalSupplyBefore = await jetToken.totalSupply();

      await jetToken.connect(owner).mint(owner.address, mintAmount);

      expect(await jetToken.balanceOf(owner.address)).to.equal(balanceBefore + mintAmount);
      expect(await jetToken.totalSupply()).to.equal(totalSupplyBefore + mintAmount);
    });
    
    // Nested describe for checking variables
    describe("Variable: balanceOf", function () {
      it("balanceOf should increase by the minted amount", async function () {
        const { jetToken, owner } = await deployJETOFixture();
        const mintAmount = 500n;
        const balanceBefore = await jetToken.balanceOf(owner.address);

        await jetToken.connect(owner).mint(owner.address, mintAmount);

        const balanceAfter = await jetToken.balanceOf(owner.address);
        expect(balanceAfter).to.equal(balanceBefore + mintAmount);
      });
    });

    describe("Variable: totalSupply()", function () {
      it("totalSupply should increase by the minted amount", async function () {
        const { jetToken, owner } = await deployJETOFixture();

        const mintAmount = 500n;
        const totalSupplyBefore = await jetToken.totalSupply();

        await jetToken.connect(owner).mint(owner.address, mintAmount);

        const totalSupplyAfter = await jetToken.totalSupply();
        expect(totalSupplyAfter).to.equal(totalSupplyBefore + mintAmount);
      });
    });

    it("Should revert if minted to Non-KYC addresses", async function () {
      const { jetToken, owner, user2 } = await deployJETOFixture();
      await expect(jetToken.connect(owner).mint(user2.address, 100))
        .to.be.revertedWithCustomError(jetToken, "NotKYCVerified")
        .withArgs(user2.address);
    });

    it("Should revert if minting 0 tokens", async function () {
      const { jetToken, owner } = await deployJETOFixture();
      await expect(jetToken.connect(owner).mint(owner.address, 0n))
        .to.be.revertedWithCustomError(jetToken, "InvalidAmount");
    });

    it("Should revert when minting would exceed the cap", async function (){
      const { jetToken, owner } = await deployJETOFixture();
      const cap = await jetToken.CAP();

      // Mint cap，应该成功
      await jetToken.connect(owner).mint(owner.address, cap);
      expect(await jetToken.balanceOf(owner.address)).to.equal(cap);

      // Mint 超过 cap，应该 revert
      await expect(
        jetToken.connect(owner).mint(owner.address, 1)
        ).to.be.revertedWithCustomError(jetToken, "ERC20ExceededCap")
        .withArgs(cap + 1n, cap);
    });

    it("Should revert if called by non-owner", async function (){
      const { jetToken, nonOwner } = await deployJETOFixture();

      await expect(
        jetToken.connect(nonOwner).mint(nonOwner.address, 50n)
        ).to.be.revertedWithCustomError(jetToken, "OwnableUnauthorizedAccount")
        .withArgs(await nonOwner.getAddress());
    });

  });

  // --- Pause ---
  describe("Pause function", function () {
    it("Owner should be able to pause and unpause", async function () {
      const { jetToken, owner, user1 } = await deployJETOFixture();

      await jetToken.connect(owner).pause();
      expect(await jetToken.paused()).to.equal(true);

      await jetToken.connect(owner).unpause();
      expect(await jetToken.paused()).to.equal(false);
    });

    it("Transfers should be blocked when paused", async function () {
      const { jetToken, owner, user1 } = await deployJETOFixture();
      await jetToken.connect(owner).mint(owner.address, 500);
      await jetToken.connect(owner).pause();

      await expect(jetToken.connect(owner).transfer(user1.address, 100))
        .to.be.revertedWithCustomError(jetToken, "EnforcedPause");
    });
  });

  // --- Transfer ---
  describe("Transfer function", function () {
    it("KYC addresses can transfer tokens", async function () {
      const { jetToken, owner, user1 } = await deployJETOFixture();
      await jetToken.connect(owner).mint(owner.address, 500);

      await jetToken.connect(owner).transfer(user1.address, 100);
      expect(await jetToken.balanceOf(owner.address)).to.equal(400);
      expect(await jetToken.balanceOf(user1.address)).to.equal(100);
    });

    it("Non-KYC addresses cannot send or receive tokens", async function () {
      const { jetToken, owner, user2, user1 } = await deployJETOFixture();
      await jetToken.connect(owner).mint(owner.address, 500);

      // 非KYC接收
      await expect(jetToken.connect(owner).transfer(user2.address, 50))
        .to.be.revertedWithCustomError(jetToken, "NotKYCVerified")
        .withArgs(user2.address);

      // 非KYC发送
      await jetToken.connect(owner).transfer(user1.address, 50);
      await expect(jetToken.connect(user2).transfer(user1.address, 10))
        .to.be.revertedWithCustomError(jetToken, "NotKYCVerified")
        .withArgs(user2.address);
    });

    describe("Variable:BalanceOf",function(){
      it("Should update balances correctly after transfers", async function () {
        const { jetToken, owner, user1, user2 } = await deployJETOFixture();

        // 添加 KYC
        await jetToken.connect(owner).addKYC([owner.address, user1.address, user2.address]);

        // Mint token 给 owner
        await jetToken.connect(owner).mint(owner.address, 500n);

        // owner -> user1
        await jetToken.connect(owner).transfer(user1.address, 200n);
        expect(await jetToken.balanceOf(owner.address)).to.equal(300n);
        expect(await jetToken.balanceOf(user1.address)).to.equal(200n);

        // user1 -> user2
        await jetToken.connect(user1).transfer(user2.address, 50n);
        expect(await jetToken.balanceOf(user1.address)).to.equal(150n);
        expect(await jetToken.balanceOf(user2.address)).to.equal(50n);
      });
    });
  });

  // --- KYC ---
  describe("KYC function", function (){

  });
});

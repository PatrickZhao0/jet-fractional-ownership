import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

describe("JetOToken Unit Tests", function () {

  async function deployJETOFixture() {
  const [owner, user1, user2, user3, user4, nonOwner] =
    await ethers.getSigners();
 

  const ComplianceFactory = await ethers.getContractFactory("Compliance");
  const compliance = await ComplianceFactory.deploy(owner.address);

  await compliance.waitForDeployment();
  const JetOTokenFactory = await ethers.getContractFactory("JetOToken");
  const jetToken = await JetOTokenFactory.deploy(
    owner.address,                 // JetOToken owner (SPV)
    await compliance.getAddress()  // 合规合约地址
  );
  await compliance.transferOwnership(jetToken.getAddress());

  await jetToken.waitForDeployment();

  // 3. 执行 KYC（调用 token.addKYC 会自动转发到 compliance）
  await jetToken.connect(owner).addKYC([
    owner.address,
    user1.address,
    user3.address,
  ]);

  return { jetToken, compliance, owner, user1, user2, user3, user4, nonOwner };
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

      await expect(jetToken.connect(owner).mint(owner.address, mintAmount))
        .to.emit(jetToken, "Minted")
        .withArgs(owner.address, mintAmount);
    });
    
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

      await jetToken.connect(owner).mint(owner.address, cap);
      expect(await jetToken.balanceOf(owner.address)).to.equal(cap);

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

      await expect(jetToken.connect(owner).transfer(user2.address, 50))
        .to.be.revertedWithCustomError(jetToken, "NotKYCVerified")
        .withArgs(user2.address);

      await jetToken.connect(owner).transfer(user1.address, 50);
      await expect(jetToken.connect(user2).transfer(user1.address, 10))
        .to.be.revertedWithCustomError(jetToken, "NotKYCVerified")
        .withArgs(user2.address);
    });

    describe("Variable:BalanceOf",function(){
      it("Should update balances correctly after transfers", async function () {
        const { jetToken, owner, user1, user3 } = await deployJETOFixture();

        // user1-> user3
        await jetToken.connect(owner).mint(user1.address, 500n);
        await jetToken.connect(user1).transfer(user3.address, 200n);
        expect(await jetToken.balanceOf(user1.address)).to.equal(300n);
        expect(await jetToken.balanceOf(user3.address)).to.equal(200n);

        // user3 -> user1
        await jetToken.connect(user3).transfer(user1.address, 50n);
        expect(await jetToken.balanceOf(user1.address)).to.equal(350n);
        expect(await jetToken.balanceOf(user3.address)).to.equal(150n);
      });
    });
  });

  // --- KYC ---
  describe("KYC function", function (){
    it("Should trigger event only when need to change status", async function () {
      const { jetToken, compliance, owner, user1 } = await deployJETOFixture();

      // 1st remove → emit (event from compliance, NOT jetToken)
      await expect(
        jetToken.connect(owner).removeKYC([user1.address])
      )
        .to.emit(compliance, "KYCBatchUpdated")
        .withArgs([user1.address], false);

      // remove again → skip (no event)
      await expect(
        jetToken.connect(owner).removeKYC([user1.address])
      ).to.not.emit(compliance, "KYCBatchUpdated");

      // add → emit
      await expect(
        jetToken.connect(owner).addKYC([user1.address])
      )
        .to.emit(compliance, "KYCBatchUpdated")
        .withArgs([user1.address], true);

      // add again → skip
      await expect(
        jetToken.connect(owner).addKYC([user1.address])
      ).to.not.emit(compliance, "KYCBatchUpdated");
    });

    describe("Boundary Testing", function (){
      it("Should raise EmptyList if input empty list of address", async function () {
        const { jetToken, compliance, owner } = await deployJETOFixture();

        await expect(
          jetToken.connect(owner).addKYC([])
        ).to.be.revertedWithCustomError(compliance, "EmptyList");
      });

      it("Should skip zero address", async function (){
        const { jetToken, compliance, owner, user2 } = await deployJETOFixture();

        await expect(
          jetToken.connect(owner).addKYC([ethers.ZeroAddress, user2.address])
        )
          .to.emit(compliance, "KYCBatchUpdated")
          .withArgs([user2.address], true);

        expect(await compliance.kycVerified(user2.address)).to.be.true;
        expect(await compliance.kycVerified(ethers.ZeroAddress)).to.be.false;
      });

      it("Should skip if KYC already when add KYC", async function (){
        const { jetToken, compliance, owner, user1 } = await deployJETOFixture();

        await jetToken.connect(owner).addKYC([user1.address]);

        await expect(
          jetToken.connect(owner).addKYC([user1.address])
        ).to.not.emit(compliance, "KYCBatchUpdated");
      });

      it("Should skip if non-KYC already when remove KYC", async function (){
        const { jetToken, compliance, owner, user2 } = await deployJETOFixture();

        await expect(
          jetToken.connect(owner).removeKYC([user2.address])
        ).to.not.emit(compliance, "KYCBatchUpdated");
      });
    });

    describe("updateKYCStatus", function (){
      it("Non-owner cannot update compliance contract", async function () {
        const { jetToken, user1 } = await deployJETOFixture();

        await expect(
          jetToken.connect(user1).setCompliance(user1.address)
        ).to.be.revertedWithCustomError(jetToken, "OwnableUnauthorizedAccount");
      });
      describe("addKYC", function (){
        it("Should correctly add batch KYC", async function () {
          const { jetToken, compliance, owner, user2, user4 } =
            await deployJETOFixture();

          await expect(
            jetToken.connect(owner).addKYC([user2.address, user4.address])
          )
            .to.emit(compliance, "KYCBatchUpdated")
            .withArgs([user2.address, user4.address], true);

        expect(await compliance.kycVerified(user2.address)).to.equal(true);
        expect(await compliance.kycVerified(user4.address)).to.equal(true);
        });
      });

      describe("removeKYC", function (){
        it("Should correctly remove batch KYC", async function () {
          const { jetToken, compliance, owner, user1, user3 } =
            await deployJETOFixture();

          await jetToken.connect(owner).addKYC([user1.address, user3.address]);

          await expect(
            jetToken.connect(owner).removeKYC([user1.address, user3.address])
          )
            .to.emit(compliance, "KYCBatchUpdated")
            .withArgs([user1.address, user3.address], false);

          expect(await compliance.kycVerified(user1.address)).to.equal(false);
          expect(await compliance.kycVerified(user3.address)).to.equal(false);
        });
      });

      describe("Variable:status", function (){
        it("Should become ture when excuted addKYC", async function (){
          const { jetToken, compliance, owner, user1 } =
            await deployJETOFixture();

          await jetToken.connect(owner).addKYC([user1.address]);
          expect(await compliance.kycVerified(user1.address)).to.equal(true);
        });

        it("Should become false when excuted removeKYC", async function (){
          const { jetToken, compliance, owner, user1 } =
            await deployJETOFixture();

          await jetToken.connect(owner).addKYC([user1.address]);
          await jetToken.connect(owner).removeKYC([user1.address]);

          expect(await compliance.kycVerified(user1.address)).to.equal(false);
        });
      });     
    });
  });
});

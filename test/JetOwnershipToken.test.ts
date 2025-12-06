import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

async function deployJETOFixture() {
  const [owner, user1, user2, user3, user4, nonOwner] =
    await ethers.getSigners();

  const ComplianceFactory = await ethers.getContractFactory("Compliance");
  const compliance = await ComplianceFactory.deploy(owner.address);

  await compliance.waitForDeployment();
  const JetOTokenFactory = await ethers.getContractFactory("JetOwnershipToken");
  const JetO = await JetOTokenFactory.deploy(
    owner.address,
    await compliance.getAddress()
  );
  await compliance.transferOwnership(JetO.getAddress());

  await JetO.waitForDeployment();

  await JetO.connect(owner).addKYC([
    owner.address,
    user1.address,
    user3.address,
  ]);

  return {
    JetO,
    compliance,
    owner,
    user1,
    user2,
    user3,
    user4,
    nonOwner,
  };
}

describe("Jet-O Token Unit Tests", function () {
  describe("decimal function", function () {
    it("Should have 3 decimals", async function () {
      const { JetO } = await deployJETOFixture();
      expect(await JetO.decimals()).to.equal(3);
    });
  });

  describe("mint function", function () {
    it("Owner should be able to mint tokens to KYC addresses", async function () {
      const { JetO, owner } = await deployJETOFixture();
      const mintAmount = 500n;

      await expect(JetO.connect(owner).mint(owner.address, mintAmount))
        .to.emit(JetO, "Minted")
        .withArgs(owner.address, mintAmount);
    });

    describe("variable: balanceOf", function () {
      it("balanceOf should increase by the minted amount", async function () {
        const { JetO, owner } = await deployJETOFixture();
        const mintAmount = 500n;
        const balanceBefore = await JetO.balanceOf(owner.address);

        await JetO.connect(owner).mint(owner.address, mintAmount);

        const balanceAfter = await JetO.balanceOf(owner.address);
        expect(balanceAfter).to.equal(balanceBefore + mintAmount);
      });
    });

    describe("variable: totalSupply", function () {
      it("totalSupply should increase by the minted amount", async function () {
        const { JetO, owner } = await deployJETOFixture();

        const mintAmount = 500n;
        const totalSupplyBefore = await JetO.totalSupply();

        await JetO.connect(owner).mint(owner.address, mintAmount);

        const totalSupplyAfter = await JetO.totalSupply();
        expect(totalSupplyAfter).to.equal(totalSupplyBefore + mintAmount);
      });
    });

    it("Should revert if minted to Non-KYC addresses", async function () {
      const { JetO, owner, user2 } = await deployJETOFixture();
      await expect(JetO.connect(owner).mint(user2.address, 100))
        .to.be.revertedWithCustomError(JetO, "NotKYCVerified")
        .withArgs(user2.address);
    });

    it("Should revert if minting 0 tokens", async function () {
      const { JetO, owner } = await deployJETOFixture();
      await expect(
        JetO.connect(owner).mint(owner.address, 0n)
      ).to.be.revertedWithCustomError(JetO, "InvalidAmount");
    });

    it("Should revert when minting would exceed the cap", async function () {
      const { JetO, owner } = await deployJETOFixture();
      const cap = await JetO.CAP();

      await JetO.connect(owner).mint(owner.address, cap);
      expect(await JetO.balanceOf(owner.address)).to.equal(cap);

      await expect(JetO.connect(owner).mint(owner.address, 1))
        .to.be.revertedWithCustomError(JetO, "ERC20ExceededCap")
        .withArgs(cap + 1n, cap);
    });

    it("Should revert if called by non-owner", async function () {
      const { JetO, nonOwner } = await deployJETOFixture();

      await expect(JetO.connect(nonOwner).mint(nonOwner.address, 50n))
        .to.be.revertedWithCustomError(JetO, "OwnableUnauthorizedAccount")
        .withArgs(await nonOwner.getAddress());
    });
  });

  describe("pause function", function () {
    it("Owner should be able to pause and unpause", async function () {
      const { JetO, owner, user1 } = await deployJETOFixture();

      await JetO.connect(owner).pause();
      expect(await JetO.paused()).to.equal(true);

      await JetO.connect(owner).unpause();
      expect(await JetO.paused()).to.equal(false);
    });

    it("Transfers should be blocked when paused", async function () {
      const { JetO, owner, user1 } = await deployJETOFixture();
      await JetO.connect(owner).mint(owner.address, 500);
      await JetO.connect(owner).pause();

      await expect(
        JetO.connect(owner).transfer(user1.address, 100)
      ).to.be.revertedWithCustomError(JetO, "EnforcedPause");
    });
  });

  describe("setCompliance function", function () {
    it("should not allow non-owner to update compliance", async function () {
      const { JetO, user1 } = await deployJETOFixture();
      await expect(
        JetO.connect(user1).setCompliance(user1.address)
      ).to.be.revertedWithCustomError(JetO, "OwnableUnauthorizedAccount");
    });
    it("should allow owner to update compliance", async function () {
      const { JetO, owner, user1 } = await deployJETOFixture();

      await expect(
        JetO.connect(owner).setCompliance(user1.address)
      ).to.not.be.revertedWithCustomError(JetO, "OwnableUnauthorizedAccount");
    });
  });

  describe("transfer function", function () {
    it("KYC addresses can transfer tokens", async function () {
      const { JetO, owner, user1 } = await deployJETOFixture();
      await JetO.connect(owner).mint(owner.address, 500);

      await JetO.connect(owner).transfer(user1.address, 100);
      expect(await JetO.balanceOf(owner.address)).to.equal(400);
      expect(await JetO.balanceOf(user1.address)).to.equal(100);
    });

    it("Non-KYC addresses cannot send or receive tokens", async function () {
      const { JetO, owner, user2, user1 } = await deployJETOFixture();
      await JetO.connect(owner).mint(owner.address, 500);

      await expect(JetO.connect(owner).transfer(user2.address, 50))
        .to.be.revertedWithCustomError(JetO, "NotKYCVerified")
        .withArgs(user2.address);

      await JetO.connect(owner).transfer(user1.address, 50);
      await expect(JetO.connect(user2).transfer(user1.address, 10))
        .to.be.revertedWithCustomError(JetO, "NotKYCVerified")
        .withArgs(user2.address);
    });

    describe("variable: balanceOf", function () {
      it("Should update balances correctly after transfers", async function () {
        const { JetO, owner, user1, user3 } = await deployJETOFixture();

        // user1-> user3
        await JetO.connect(owner).mint(user1.address, 500n);
        await JetO.connect(user1).transfer(user3.address, 200n);
        expect(await JetO.balanceOf(user1.address)).to.equal(300n);
        expect(await JetO.balanceOf(user3.address)).to.equal(200n);

        // user3 -> user1
        await JetO.connect(user3).transfer(user1.address, 50n);
        expect(await JetO.balanceOf(user1.address)).to.equal(350n);
        expect(await JetO.balanceOf(user3.address)).to.equal(150n);
      });
    });
  });
});

describe("Compliance Unit Tests", function () {
  it("Should trigger events only when status changed", async function () {
    const { JetO, compliance, owner, user1 } = await deployJETOFixture();

    // 1st remove → emit (event from compliance, NOT JetO)
    await expect(JetO.connect(owner).removeKYC([user1.address]))
      .to.emit(compliance, "KYCBatchUpdated")
      .withArgs([user1.address], false);

    // remove again → skip (no event)
    await expect(JetO.connect(owner).removeKYC([user1.address])).to.not.emit(
      compliance,
      "KYCBatchUpdated"
    );

    // add → emit
    await expect(JetO.connect(owner).addKYC([user1.address]))
      .to.emit(compliance, "KYCBatchUpdated")
      .withArgs([user1.address], true);

    // add again → skip
    await expect(JetO.connect(owner).addKYC([user1.address])).to.not.emit(
      compliance,
      "KYCBatchUpdated"
    );
  });

  describe("addKYC function", function () {
    it("Should correctly add batch KYC", async function () {
      const { JetO, compliance, owner, user2, user4 } =
        await deployJETOFixture();

      await expect(JetO.connect(owner).addKYC([user2.address, user4.address]))
        .to.emit(compliance, "KYCBatchUpdated")
        .withArgs([user2.address, user4.address], true);

      expect(await compliance.kycVerified(user2.address)).to.equal(true);
      expect(await compliance.kycVerified(user4.address)).to.equal(true);
    });

    it("Should skip zero address", async function () {
      const { JetO, compliance, owner, user2 } = await deployJETOFixture();

      await expect(
        JetO.connect(owner).addKYC([ethers.ZeroAddress, user2.address])
      )
        .to.emit(compliance, "KYCBatchUpdated")
        .withArgs([user2.address], true);

      expect(await compliance.kycVerified(user2.address)).to.be.true;
      expect(await compliance.kycVerified(ethers.ZeroAddress)).to.be.false;
    });

    it("Should skip if KYC already when add KYC", async function () {
      const { JetO, compliance, owner, user1 } = await deployJETOFixture();

      await JetO.connect(owner).addKYC([user1.address]);

      await expect(JetO.connect(owner).addKYC([user1.address])).to.not.emit(
        compliance,
        "KYCBatchUpdated"
      );
    });

    it("Should raise EmptyList if input empty list of address", async function () {
      const { JetO, compliance, owner } = await deployJETOFixture();

      await expect(
        JetO.connect(owner).addKYC([])
      ).to.be.revertedWithCustomError(compliance, "EmptyList");
    });
  });

  describe("removeKYC function", function () {
    it("Should correctly remove batch KYC", async function () {
      const { JetO, compliance, owner, user1, user3 } =
        await deployJETOFixture();

      await JetO.connect(owner).addKYC([user1.address, user3.address]);

      await expect(
        JetO.connect(owner).removeKYC([user1.address, user3.address])
      )
        .to.emit(compliance, "KYCBatchUpdated")
        .withArgs([user1.address, user3.address], false);

      expect(await compliance.kycVerified(user1.address)).to.equal(false);
      expect(await compliance.kycVerified(user3.address)).to.equal(false);
    });

    it("Should skip if non-KYC already when remove KYC", async function () {
      const { JetO, compliance, owner, user2 } = await deployJETOFixture();

      await expect(JetO.connect(owner).removeKYC([user2.address])).to.not.emit(
        compliance,
        "KYCBatchUpdated"
      );
    });
  });

  describe("variable: status", function () {
    it("Should become ture when excuted addKYC", async function () {
      const { JetO, compliance, owner, user1 } = await deployJETOFixture();

      await JetO.connect(owner).addKYC([user1.address]);
      expect(await compliance.kycVerified(user1.address)).to.equal(true);
    });

    it("Should become false when excuted removeKYC", async function () {
      const { JetO, compliance, owner, user1 } = await deployJETOFixture();

      await JetO.connect(owner).addKYC([user1.address]);
      await JetO.connect(owner).removeKYC([user1.address]);

      expect(await compliance.kycVerified(user1.address)).to.equal(false);
    });
  });
});

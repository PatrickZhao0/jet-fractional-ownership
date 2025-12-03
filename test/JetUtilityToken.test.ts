import { expect } from "chai"
import hre from "hardhat"

const { ethers, networkHelpers } = await hre.network.connect();

describe("JET-U Token Tests", function () {
  async function deployTokenFixture() {
    const [owner, buyer, poorUser, attacker] = await ethers.getSigners();

    // 1. Deploy MockUSDT
    const MockUSDT = await ethers.deployContract("MockUSDT");
    await MockUSDT.waitForDeployment();

    // 2. Deploy JET-U
    const initialPrice = 100n; 
    const JetUtilityToken = await ethers.deployContract("JetUtilityToken", [
      owner.address,
      MockUSDT.target,
      initialPrice
    ]);
    await JetUtilityToken.waitForDeployment();

    // 3. mint USDT
    await MockUSDT.mint(buyer.address, 10000n);

    return { 
      jetU: JetUtilityToken, 
      usdt: MockUSDT, 
      owner, 
      buyer, 
      poorUser, 
      attacker,
      initialPrice 
    };
  }

// --- Admin Testing ---
  describe("Admin Functions", function () {
    //set price
    describe("setPrice", function () {
      it("Should allow owner to set price", async function () {
        const { jetU, owner } = await networkHelpers.loadFixture(deployTokenFixture) as any;
        const newPrice = 200n;
        await expect(jetU.connect(owner).setPrice(newPrice))
          .to.emit(jetU, "PriceUpdated")
          .withArgs(newPrice);
      });

      it("Should revert if non-owner tries to set price", async function () {
        const { jetU, attacker } = await networkHelpers.loadFixture(deployTokenFixture);
        // Attacker set price
        await expect(jetU.connect(attacker).setPrice(0n))
          .to.be.revertedWithCustomError(jetU, "OwnableUnauthorizedAccount")
          .withArgs(attacker.address);
      });

      describe("variable: tokenPrice", function () {
          it("should update the tokenPrice, after SPV set a new price", async function () {
            const { jetU, owner } = await networkHelpers.loadFixture(deployTokenFixture) as any;
            const newPrice = 200n;
            await jetU.connect(owner).setPrice(newPrice);
            expect(await jetU.tokenPrice()).to.equal(newPrice);
          });
      });
    
    });


    // mint 
    describe("mint", function () {
      it("Should allow SPV to mint tokens to users", async function () {
        const { jetU, owner, buyer } = await networkHelpers.loadFixture(deployTokenFixture);
        
        await jetU.connect(owner).mint(buyer.address, 100n);
        expect(await jetU.balanceOf(buyer.address)).to.equal(100n);
      });

      it("Should allow SPV to mint tokens to itself", async function (){
        const { jetU, owner } = await networkHelpers.loadFixture(deployTokenFixture);
        await jetU.connect(owner).mintToSPV(100n);
        expect(await jetU.balanceOf(owner.address)).to.equal(100n);
      });
      it("Should revert if non-owner tries to mint", async function () {
        const { jetU, attacker } = await networkHelpers.loadFixture(deployTokenFixture);
        // Attacker Mint
        await expect(jetU.connect(attacker).mint(attacker.address, 1000n))
          .to.be.revertedWithCustomError(jetU, "OwnableUnauthorizedAccount")
          .withArgs(attacker.address);
      });
    });

    // burn
    describe("burn", function () {
      it("Should allow SPV to burn its own tokens", async function () {
        const { jetU, owner } = await networkHelpers.loadFixture(deployTokenFixture);
        await jetU.connect(owner).mint(owner.address, 50n);
        await jetU.connect(owner).burn(50n);
        expect(await jetU.balanceOf(owner.address)).to.equal(0n);
      });

      it("Should revert if regular user tries to burn their own tokens", async function () {
        const { jetU, owner, buyer } = await networkHelpers.loadFixture(deployTokenFixture);
        await jetU.connect(owner).mint(buyer.address, 100n);
        await expect(jetU.connect(buyer).burn(100n))
          .to.be.revertedWithCustomError(jetU, "OwnableUnauthorizedAccount")
          .withArgs(buyer.address);
      });

    });
    describe("burnFrom", function () {
      it("Should revert if SPV tries to burn buyer's tokens (burnFrom disabled)", async function () {
        const { jetU, owner, buyer } = await networkHelpers.loadFixture(deployTokenFixture);
        await jetU.connect(owner).mint(buyer.address, 100n);
        await jetU.connect(buyer).approve(owner.address, 100n);
        await expect(jetU.connect(owner).burnFrom(buyer.address, 100n))
          .to.be.revertedWithCustomError(jetU, "CantBurn");
      });
      it("Should revert if attacker tries to burn buyer's tokens", async function () {
        const { jetU, owner, buyer, attacker } = await networkHelpers.loadFixture(deployTokenFixture);
        await jetU.connect(buyer).approve(attacker.address, 100n);
        await expect(jetU.connect(attacker).burnFrom(buyer.address, 10n))
          .to.be.revertedWithCustomError(jetU, "CantBurn");
      });

    });
  });

  // Purchase Testing
  describe("Purchase Function", function () {
    
    // --- Error Cases ---
    it("Should revert if purchase amount is invalid", async function () {
      const { jetU, buyer } = await networkHelpers.loadFixture(deployTokenFixture);
      
      await expect(jetU.connect(buyer).purchase(0n))
        .to.be.revertedWithCustomError(jetU, "InvalidAmount");
    });

    it("Should revert if allowance is insufficient", async function () {
      const { jetU, buyer, initialPrice } = await networkHelpers.loadFixture(deployTokenFixture);
      
      const buyAmount = 10n;
      const totalCost = buyAmount * initialPrice;

      // No Allowance
      await expect(jetU.connect(buyer).purchase(buyAmount))
        .to.be.revertedWithCustomError(jetU, "InsufficientAllowance")
        .withArgs(0n, totalCost);
    });

    it("Should revert if balance is insufficient", async function () {
      const { jetU, usdt, poorUser, initialPrice } = await networkHelpers.loadFixture(deployTokenFixture);
      
      const buyAmount = 10n;
      const totalCost = buyAmount * initialPrice;

      // No enough USDT
      await usdt.connect(poorUser).approve(jetU.target, totalCost);

      await expect(jetU.connect(poorUser).purchase(buyAmount))
        .to.be.revertedWithCustomError(jetU, "InsufficientBalance")
        .withArgs(0n, totalCost);
    });

    it("Should revert when minting to zero address", async function () {
      const { jetU, owner } = await networkHelpers.loadFixture(deployTokenFixture);
      await expect(jetU.connect(owner).mint(ethers.ZeroAddress, 100n))
        .to.be.revertedWithCustomError(jetU, "ERC20InvalidReceiver")
        .withArgs(ethers.ZeroAddress);
    });

    it("Should revert if user tries to pay with a different token (balance check)", async function () {
          const { jetU, usdt, initialPrice } = await networkHelpers.loadFixture(deployTokenFixture) as any;
          
          const signers = await ethers.getSigners();
          const stranger = signers[5]; 

          const MockToken = await ethers.getContractFactory("MockUSDT");
          const usdc = await MockToken.deploy();
          await usdc.waitForDeployment();
          await usdc.mint(stranger.address, 1000000n);
          const buyAmount = 10n;
          const totalCost = buyAmount * initialPrice;
          await usdt.connect(stranger).approve(jetU.target, totalCost);
          await expect(jetU.connect(stranger).purchase(buyAmount))
            .to.be.revertedWithCustomError(jetU, "InsufficientBalance")
            .withArgs(0n, totalCost); 
    });

    // --- Success Case ---
    it("Should execute purchase correctly", async function () {
      const { jetU, usdt, owner, buyer, initialPrice } = await networkHelpers.loadFixture(deployTokenFixture);
      
      const buyAmount = 5n;
      const totalCost = buyAmount * initialPrice;

      await usdt.connect(buyer).approve(jetU.target, totalCost);
      await expect(jetU.connect(buyer).purchase(buyAmount))
        .to.emit(jetU, "TokensPurchased")
        .withArgs(buyer.address, totalCost, buyAmount);

      expect(await usdt.balanceOf(buyer.address)).to.equal(10000n - totalCost);
      expect(await usdt.balanceOf(owner.address)).to.equal(totalCost);

      expect(await jetU.balanceOf(buyer.address)).to.equal(buyAmount);
    });
  });

  // Redeem Testing
  describe("Redeem Function", function () {
    
    // --- Error Case ---

    it("Should revert if balance is insufficient", async function () {
      const { jetU, poorUser } = await networkHelpers.loadFixture(deployTokenFixture);
      
      await expect(jetU.connect(poorUser).redeem(10n))
        .to.be.revertedWithCustomError(jetU, "InsufficientBalance")
        .withArgs(0n, 10n);
    });

    // --- Success Case ---
    it("Should burn tokens and update total supply", async function () {
      const { jetU, owner, buyer } = await networkHelpers.loadFixture(deployTokenFixture);

      await jetU.connect(owner).mint(buyer.address, 50n);

      const initialSupply = await jetU.totalSupply();

      const redeemAmount = 10n;
      await expect(jetU.connect(buyer).redeem(redeemAmount))
        .to.emit(jetU, "TokensRedeemed")
        .withArgs(buyer.address, redeemAmount);

      expect(await jetU.balanceOf(buyer.address)).to.equal(40n);
      expect(await jetU.totalSupply()).to.equal(initialSupply - redeemAmount);
    });
  });

});
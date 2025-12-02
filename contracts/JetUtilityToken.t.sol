// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./JetUtilityToken.sol";
import "./MockUSDT.sol";

// Test contract for JetUtilityToken
contract JetUtilityTokenTest {
    JetUtilityToken jetU;
    MockUSDT usdt;

    // Mock SPV Admin address (In this test context, this contract acts as the admin)
    address spv = address(this);
    uint256 initialPrice = 100;

    // --- setUp: Equivalent to `beforeEach` in JS ---
    // Runs before every test function execution to reset the environment
    function setUp() public {
        // 1. Deploy MockUSDT
        usdt = new MockUSDT();

        // 2. Deploy JetUtilityToken
        // Args: SPV (this contract), Payment Token (usdt), Price (100)
        jetU = new JetUtilityToken(spv, address(usdt), initialPrice);

        // 3. Mint some tokens to self (test contract) to simulate a user wallet
        usdt.mint(address(this), 10000);

        // 4. Approve JET-U contract to spend my USDT
        // (This step is mandatory in Solidity testing to simulate user approval)
        usdt.approve(address(jetU), 1000000);
    }

    // --- Test Case 1: Test Initial State ---
    function test_InitialState() public view {
        // Use `require` for assertions; the test fails if the condition is false
        require(jetU.tokenPrice() == initialPrice, "Price should be 100");
        require(jetU.spv() == address(this), "SPV should be this contract");
        require(jetU.paymentToken() == IERC20(address(usdt)), "Payment token mismatch");
    }

    // --- Test Case 2: Test Minting by SPV ---
    function test_MintingBySPV() public {
        // Mint 50 tokens to myself
        jetU.mint(address(this), 50);
        require(jetU.balanceOf(address(this)) == 50, "Should have 50 tokens after minting");
    }

    // --- Test Case 3: Test Purchase Function ---
    function test_Purchase() public {
        uint256 amountToBuy = 10;
        // Expected cost calculation (10 * 100 = 1000)
        // uint256 expectedCost = amountToBuy * initialPrice; 

        // Execute purchase
        jetU.purchase(amountToBuy);

        // Verify: My JET-U balance should be 10
        require(jetU.balanceOf(address(this)) == 10, "Balance should be 10");
        
    }

    // --- Test Case 4: Test Redeem Function ---
    function test_Redeem() public {
        // Buy 20 tokens first
        jetU.purchase(20);
        require(jetU.balanceOf(address(this)) == 20, "Should have 20 tokens");

        // Redeem 5 tokens
        jetU.redeem(5);

        // Verify remaining balance is 15
        require(jetU.balanceOf(address(this)) == 15, "Should have 15 tokens left");
    }

    // --- Test Case 5: Test Admin Set Price ---
    function test_SetPrice() public {
        jetU.setPrice(200);
        require(jetU.tokenPrice() == 200, "Price should update to 200");
    }

    // --- Test Case 7: Test Change SPV Address ---
    function test_ChangeSPV() public {
        address newSpv = address(0x123);
        jetU.setSPV(newSpv);
        require(jetU.spv() == newSpv, "SPV address should be updated");
    }


}
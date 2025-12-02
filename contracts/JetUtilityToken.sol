// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // Interface for payment token (e.g., USDT)

contract JetUtilityToken is ERC20, ERC20Burnable {
    // --- State Variables (Corresponding to image requirements) ---
    
    // 1. Token price (in the smallest unit of the payment token, e.g., wei for USDT)
    uint256 public tokenPrice;
    
    // 2. SPV admin address (Special permission holder)
    address public spv;
    
    // 3. Payment token interface (e.g., USDT)
    IERC20 public paymentToken;

    // --- Events (For frontend interaction) ---
    event TokensPurchased(address indexed buyer, uint256 amountSpent, uint256 tokensReceived);
    event TokensRedeemed(address indexed user, uint256 amount);
    event PriceUpdated(uint256 newPrice);
    event SpvUpdated(address newSpv);

    // --- Modifiers ---
    
    // Modifier to restrict calls to only the SPV address
    modifier isSPV() {
        require(msg.sender == spv, "JetUtilityToken: Caller is not the SPV");
        _;
    }
    
    // Rewrite decimals to 0 as per requirement
    function decimals() public view virtual override returns (uint8) {
        return 0;
    }

    // --- Constructor ---
    
    constructor(
        address _spv, 
        address _paymentToken, 
        uint256 _initialPrice
    ) ERC20("Jet Utility Token", "JET-U") {
        require(_spv != address(0), "Invalid SPV address");
        require(_paymentToken != address(0), "Invalid payment token address");
        
        spv = _spv;
        paymentToken = IERC20(_paymentToken); // Initialize payment token contract address
        tokenPrice = _initialPrice;
    }

    // --- Functions (Corresponding to image requirements) ---

    // 1. Minting function (Only callable by SPV)
    // Used for distributing benefits to shareholders or manual issuance
    function mint(address to, uint256 amount) external isSPV {
        _mint(to, amount);
    }

    // 2. Purchase function
    // Users pay with payment token (e.g., USDT) to buy JET-U
    function purchase(uint256 amountToBuy) external {
        require(amountToBuy > 0, "Amount must be greater than 0");

        // Calculate total cost in payment token
        // Note: Assuming tokenPrice is the unit price.
        // In production, be aware of unit conversion between USDT (6 decimals) and JET-U (0 decimals).
        uint256 totalCost = amountToBuy * tokenPrice;

        // Check if user has approved enough payment tokens to this contract
        uint256 allowance = paymentToken.allowance(msg.sender, address(this));
        require(allowance >= totalCost, "Check the token allowance");

        // Check user balance
        uint256 balance = paymentToken.balanceOf(msg.sender);
        require(balance >= totalCost, "Insufficient USDT balance");

        // --- Core Logic ---
        
        // A. Charge: Transfer payment tokens from user wallet to SPV address
        // Logic from image: call usdt.transfer (Corrected to transferFrom here for safety)
        bool success = paymentToken.transferFrom(msg.sender, spv, totalCost);
        require(success, "USDT transfer failed");

        // B. Delivery: Mint JET-U to user
        _mint(msg.sender, amountToBuy);

        emit TokensPurchased(msg.sender, totalCost, amountToBuy);
    }

    // 3. Redeem/Burn function
    // Users burn tokens to redeem flight hours
    function redeem(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "Insufficient balance to redeem");
        
        // Burn user's tokens
        _burn(msg.sender, amount);
        
        // Emit event; off-chain system listens to this to arrange flight service
        emit TokensRedeemed(msg.sender, amount);
    }

    // --- Setter Functions (Supplementary management functions) ---

    // Update price
    function setPrice(uint256 _newPrice) external isSPV {
        tokenPrice = _newPrice;
        emit PriceUpdated(_newPrice);
    }

    // Change SPV address
    function setSPV(address _newSpv) external isSPV {
        require(_newSpv != address(0), "Invalid address");
        spv = _newSpv;
        emit SpvUpdated(_newSpv);
    }
}
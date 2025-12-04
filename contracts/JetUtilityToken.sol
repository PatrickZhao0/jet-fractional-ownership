// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // Interface for payment token (e.g., USDT)
import "@openzeppelin/contracts/access/Ownable.sol";

interface IRevenue {
    function depositRevenue(uint256 amount) external;
}

contract JetUtilityToken is ERC20, ERC20Burnable, Ownable {
    // --- State Variables (Corresponding to image requirements) ---
    
    // 1. Token price (in the smallest unit of the payment token, e.g., wei for USDT)
    uint256 public tokenPrice;
    // 2. Payment token interface (e.g., USDT)
    IERC20 public paymentToken;

    // to Revenue Distribution Contract
    address public revenueContract;
    function setRevenueContract(address _revenue) external onlyOwner {
        revenueContract = _revenue;
    }


    // --- Error ---
    error InvalidAddress(); // check payment address 
    error InvalidAmount(); // check amount is valid or not 
    error InsufficientAllowance(uint256 allowance, uint256 required); // check allowance is enough or not 
    error InsufficientBalance(uint256 available, uint256 required); // check balance is enough or not
    error FailedTransfer(); // check transfer is successful or not 
    error CantBurn(); 
    error OwnershipTransferDisabled();
    error NotApproveRevenuecontract();

    // --- Events (For frontend interaction) ---
    event TokensPurchased(address indexed buyer, uint256 amountSpent, uint256 tokensReceived);
    event TokensRedeemed(address indexed user, uint256 amount);
    event PriceUpdated(uint256 newPrice);
    
    // Rewrite decimals to 0 as per requirement
    function decimals() public view virtual override returns (uint8) {
        return 0;
    }

    // --- Constructor ---
    constructor(
        address _initialOwner, 
        address _paymentToken, 
        uint256 _initialPrice
    ) ERC20("Jet Utility Token", "JET-U") Ownable(_initialOwner) 
    {
        paymentToken = IERC20(_paymentToken); // Initialize payment token contract address
        tokenPrice = _initialPrice;
    } 


    // --- Functions (Corresponding to image requirements) ---

    // 1. Minting function (Only callable by SPV)
    // Used for distributing benefits to shareholders or manual issuance
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    // mint to SPV
    function mintToSPV(uint256 amount) external onlyOwner{
        _mint(owner(), amount);
    }


    // 2. Purchase function
    // Users pay with payment token (e.g., USDT) to buy JET-U
    function purchase(uint256 amountToBuy) external {
        if (amountToBuy <= 0) revert InvalidAmount();

        // Calculate total cost in payment token
        // Note: Assuming tokenPrice is the unit price.
        // In production, be aware of unit conversion between USDT (6 decimals) and JET-U (0 decimals).
        uint256 totalCost = amountToBuy * tokenPrice;

        // Check if user has approved enough payment tokens to this contract
        uint256 allowance = paymentToken.allowance(msg.sender, address(this));
        if (allowance < totalCost) revert InsufficientAllowance(allowance, totalCost);

        // Check user balance
        uint256 balance = paymentToken.balanceOf(msg.sender);
        if (balance < totalCost) revert InsufficientBalance(balance, totalCost);

        // --- Core Logic ---
        
        // A. Charge: Transfer payment tokens from user wallet to SPV address
        // Logic from image: call usdt.transfer (Corrected to transferFrom here for safety)
        bool success = paymentToken.transferFrom(msg.sender, owner(), totalCost);
        if ( !success ) revert FailedTransfer();

        // B. Delivery: Mint JET-U to user
        _mint(msg.sender, amountToBuy);

        emit TokensPurchased(msg.sender, totalCost, amountToBuy);
    }

    // 3. Redeem/Burn function
    // Users burn tokens to redeem flight hours
    function burn(uint256 value) public override onlyOwner {
        _burn(msg.sender, value);
    }

    function burnFrom(address account, uint256 value) public override {
        revert CantBurn();
    }


    function redeem(uint256 amount) external {
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance(balanceOf(msg.sender), amount);
        // Burn user's tokens
        _burn(msg.sender, amount);
        
        // Emit event; off-chain system listens to this to arrange flight service
        emit TokensRedeemed(msg.sender, amount);
    }

    // --- Setter Functions (Supplementary management functions) ---

    // 1. Update price
    function setPrice(uint256 _newPrice) external onlyOwner {
        tokenPrice = _newPrice;
        emit PriceUpdated(_newPrice);
    }

    // 2. Lock SPV Address 

    function transferOwnership(address /*newOwner*/) public override onlyOwner {
        revert OwnershipTransferDisabled();
    }

    function renounceOwnership() public override onlyOwner {
        revert OwnershipTransferDisabled();
    }
    
    // 3. send USDT to RevenueDistribution contract
    function SentUSDTtoRevenue(uint256 amount) external onlyOwner {
        if (revenueContract == address(0)) revert NotApproveRevenuecontract();
        paymentToken.approve(revenueContract, amount);
        IRevenue(revenueContract).depositRevenue(amount);
    }
}
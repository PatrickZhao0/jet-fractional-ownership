// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


contract JetUtilityToken is ERC20, ERC20Burnable, Ownable {
    
    // Token price (in USDT)
    uint256 public tokenPrice;
    // Payment token (USDT in real life)
    IERC20 public paymentToken;


    mapping (address => bool) public approvedRevenueReceivers;

    function addApprovedRevenueReceiver(address receiver) external onlyOwner {
        approvedRevenueReceivers[receiver] = true;
    }

    function removeApprovedRevenueReceiver(address receiver) external onlyOwner {
        approvedRevenueReceivers[receiver] = false;
    }

    error InvalidAddress(); // check payment address 
    error InvalidAmount(); // check amount is valid or not 
    error InsufficientAllowance(uint256 allowance, uint256 required); // check allowance is enough or not 
    error InsufficientBalance(uint256 available, uint256 required); // check balance is enough or not
    error TransferFailed(); // check transfer is successful or not 
    error TokenNotBurnable(); 
    error OwnershipTransferDisabled();
    error NotApprovedRevenueReceiver();

    event TokensPurchased(address indexed buyer, uint256 amountSpent, uint256 tokensReceived);
    event TokensRedeemed(address indexed user, uint256 amount);
    event PriceUpdated(uint256 newPrice);
    event RevenueSent(address indexed receiver, uint256 amount);
    
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    constructor(
        address _initialOwner, 
        address _paymentToken, 
        uint256 _initialPrice
    ) ERC20("Jet Utility Token", "JET-U") Ownable(_initialOwner) 
    {
        paymentToken = IERC20(_paymentToken); // Initialize payment token contract address (USDT in reallife)
        tokenPrice = _initialPrice;
    } 

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function mintToSPV(uint256 amount) external onlyOwner{
        _mint(owner(), amount);
    }

    function purchase(uint256 amountToBuy) external {
        if (amountToBuy <= 0) revert InvalidAmount();

        uint256 totalCost = amountToBuy * tokenPrice;

        uint256 allowance = paymentToken.allowance(msg.sender, address(this));
        if (allowance < totalCost) revert InsufficientAllowance(allowance, totalCost);

        uint256 balance = paymentToken.balanceOf(msg.sender);
        if (balance < totalCost) revert InsufficientBalance(balance, totalCost);

        bool success = paymentToken.transferFrom(msg.sender, address(this), totalCost);
        if (!success) revert TransferFailed();

        _mint(msg.sender, amountToBuy);

        emit TokensPurchased(msg.sender, totalCost, amountToBuy);
    }

    function burn(uint256 value) public override onlyOwner {
        _burn(msg.sender, value);
    }

    function burnFrom(address /*account*/, uint256 /*value*/) public pure override {
        revert TokenNotBurnable();
    }

    function redeem(uint256 amount) external {
        if (balanceOf(msg.sender) < amount) revert InsufficientBalance(balanceOf(msg.sender), amount);
        _burn(msg.sender, amount);
        emit TokensRedeemed(msg.sender, amount);
    }

    function setPrice(uint256 _newPrice) external onlyOwner {
        tokenPrice = _newPrice;
        emit PriceUpdated(_newPrice);
    }

    function transferOwnership(address /*newOwner*/) public view override onlyOwner {
        revert OwnershipTransferDisabled();
    }

    function renounceOwnership() public view override onlyOwner {
        revert OwnershipTransferDisabled();
    }
    
    function SendRevenueToReceiver(address receiver, uint256 amount) external onlyOwner {
        if (!approvedRevenueReceivers[receiver]) revert NotApprovedRevenueReceiver();
        bool success = paymentToken.transfer(receiver, amount);
        if (!success) revert TransferFailed();
        emit RevenueSent(receiver, amount);
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "./ICompliance.sol";

error InvalidAmount();                                              
error NotKYCVerified(address user);         
//error ZeroAddress();                       

/// @title Jet Ownership Token (JET-O)
/// @notice ERC20 token with decimals = 3, capped supply, pausability, SPV role, and staking interface reserved.
contract JetOToken is ERC20Capped, Pausable, Ownable {

    uint8 private constant _DECIMALS = 3;
    uint256 public constant CAP = 1000 * (10 ** _DECIMALS); // 1000.000

    ICompliance public compliance;

    event Minted(address indexed to, uint256 amount);
    //event KYCBatchUpdated(address[] users, bool status); // true=added, false=removed

    constructor(address _initialOwner, address complianceAddress)
        ERC20("Jet Ownership Token", "JET-O")//
        ERC20Capped(CAP)
        Ownable(_initialOwner){
            //if (_initialOwner == address(0)) revert ZeroAddress();
            compliance = ICompliance(complianceAddress);
            //compliance.transferOwnership(address(this));
    }

    function setCompliance(address newCompliance) external onlyOwner {
        compliance = ICompliance(newCompliance);
    }

    /// @dev decimals override to 3
    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /* ------------------- Pause ------------------- */
    /// @notice pause contract,only owner
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice unpause contract,only owner
    function unpause() external onlyOwner {
        _unpause();
    }

    /* ------------------- KYC ------------------- */
    // @notice batch add,trigger 1 emit
    /// @param users list of address，one [address]，multi [address1, address2, ...]
    function addKYC(address[] calldata users) external onlyOwner {
        compliance.addKYC(users);
    }

    /// @notice batch remove  
    /// @param users list of address，one [address]，multi [address1, address2, ...]
    function removeKYC(address[] calldata users) external onlyOwner {
        compliance.removeKYC(users);
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (value == 0) revert InvalidAmount();
        //if (to == address(0)) revert ZeroAddress();
        if (to != address(0) && !compliance.kycVerified(to))
            revert NotKYCVerified(to);
        if (from != address(0) && !compliance.kycVerified(from))
            revert NotKYCVerified(from);
        super._update(from, to, value);
    }

    /* ------------------- Mint ------------------- */
    /// @notice Mint tokens. Only SPV role.
    function mint(address to, uint256 amount)
        external
        whenNotPaused
        onlyOwner
    {
        //if (amount == 0) revert InvalidAmount();
        //if (to == address(0)) revert ZeroAddress();
        if (!compliance.kycVerified(to))
            revert NotKYCVerified(to);

        _mint(to, amount);
        emit Minted(to, amount);
    }
}
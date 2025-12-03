// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Jet Ownership Token (JET-O)
/// @notice ERC20 token with decimals = 3, capped supply, pausability, SPV role, and staking interface reserved.
contract JetOToken is ERC20Capped, Pausable, AccessControl {
    bytes32 public constant SPV_ROLE = keccak256("SPV_ROLE");

    uint8 private constant _DECIMALS = 3;
    uint256 public constant CAP = 1000 * (10 ** _DECIMALS); // 1000.000

    address public stakingContract;

    event StakingContractSet(address indexed oldAddress, address indexed newAddress);
    event Minted(address indexed to, uint256 amount);

    constructor(address oSPV)
        ERC20("Jet Ownership Token", "JET-O")
        ERC20Capped(CAP)
    {
        require(oSPV != address(0), "oSPV zero");
        _grantRole(DEFAULT_ADMIN_ROLE, oSPV);
        _grantRole(SPV_ROLE, oSPV);
    }

    /// @dev decimals override to 3
    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Mint tokens. Only SPV role.
    function mint(address to, uint256 amount)
        external
        whenNotPaused
        onlyRole(SPV_ROLE)
    {
        _mint(to, amount);
        emit Minted(to, amount);
    }

    function pause() external onlyRole(SPV_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(SPV_ROLE) {
        _unpause();
    }

    function setStakingContract(address _staking) external onlyRole(SPV_ROLE) {
        address old = stakingContract;
        stakingContract = _staking;
        emit StakingContractSet(old, _staking);
    }

    /// @notice Reserved for future staking contract
    function getLockedAmount(address user) public view returns (uint256) {
        user;
        return 0;
    }

    /**
     * @dev OpenZeppelin 5.x unified transfer/mint/burn logic
     * This replaces the old _beforeTokenTransfer hook.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        // Future lock check here:
        /*
        if (stakingContract != address(0) && from != address(0)) {
            uint256 locked = IStakingContract(stakingContract).lockedAmount(from);
            uint256 bal = balanceOf(from);
            require(bal - locked >= value, "transfer exceeds unlocked");
        }
        */

        super._update(from, to, value);
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

error InvalidAmount();                      // 禁止 0 数量操作
error EmptyList();                          // 专用于空数组（新定义）
error NotKYCVerified(address user);         // 地址未通过 KYC
error ZeroAddress();                        // 零地址问题

/// @title Jet Ownership Token (JET-O)
/// @notice ERC20 token with decimals = 3, capped supply, pausability, SPV role, and staking interface reserved.
contract JetOToken is ERC20Capped, Pausable, Ownable {

    uint8 private constant _DECIMALS = 3;
    uint256 public constant CAP = 1000 * (10 ** _DECIMALS); // 1000.000

    mapping(address => bool) public kycVerified;

    event Minted(address indexed to, uint256 amount);
    event KYCBatchUpdated(address[] users, bool status); // true=添加, false=移除

    constructor(address _initialOwner)
        ERC20("Jet Ownership Token", "JET-O")//代币名称
        ERC20Capped(CAP)//代币上限
        Ownable(_initialOwner){
            if (_initialOwner == address(0)) revert ZeroAddress();
        }//合约所有者

    /// @dev decimals override to 3
    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /* ------------------- Pause ------------------- */
    /// @notice 暂停合约（仅owner）
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice 恢复合约（仅owner）
    function unpause() external onlyOwner {
        _unpause();
    }

    /* ------------------- KYC ------------------- */
    // @notice 批量添加 KYC，使用单次事件
    /// @param users 地址数组，单地址传 [address]，多地址传 [address1, address2, ...]
    function addKYC(address[] calldata users) external onlyOwner {
        _updateKYCStatus(users, true);
    }

    /// @notice 批量移除 KYC 地址  
    /// @param users 地址数组，单地址传 [address]，多地址传 [address1, address2, ...]
    function removeKYC(address[] calldata users) external onlyOwner {
        _updateKYCStatus(users, false);
    }

    /// @notice 内部处理KYC状态更新（统一逻辑）
    /// @param users 要更新的地址数组
    /// @param status true=添加KYC, false=移除KYC
    function _updateKYCStatus(address[] calldata users, bool status) private {
        // 使用 reverse error 代替 require
        if (users.length == 0) revert EmptyList();
        
        // 收集实际发生变更的地址
        address[] memory changedUsers = new address[](users.length);
        uint256 changedCount = 0;
        
        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            
            //跳过0地址
            if (user == address(0)) {
                continue;
            }

            // 已经是目标状态，跳过（不 emit）
            bool current = kycVerified[user];
            if (current == status) {
                continue;
            }
            
            // 执行状态更新
            kycVerified[user] = status;
            changedUsers[changedCount] = user;
            changedCount++;
        }
        
        // 只有确实有变更时才触发事件
        if (changedCount > 0) {
            assembly {
                mstore(changedUsers, changedCount)
            }
            emit KYCBatchUpdated(changedUsers, status);
        }
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (value == 0) revert InvalidAmount();
        if (to == address(0)) revert ZeroAddress();//防止失误烧币
        if (to != address(0) && !kycVerified[to]) revert NotKYCVerified(to);
        if (from != address(0) && !kycVerified[from]) revert NotKYCVerified(from);
        super._update(from, to, value);
    }

    /* ------------------- Mint ------------------- */
    /// @notice Mint tokens. Only SPV role.
    function mint(address to, uint256 amount)
        external
        whenNotPaused
        onlyOwner
    {
        if (amount == 0) revert InvalidAmount();
        if (to == address(0)) revert ZeroAddress();
        if (!kycVerified[to]) revert NotKYCVerified(to);

        _mint(to, amount);
        emit Minted(to, amount);
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Errors } from "./Errors.sol";

contract OwnershipStaking is Ownable {
    IERC20 public immutable stakingToken;

    uint256 public totalStaked;
    
    struct StakerRights {
        bool votable;
        bool profitable;
        bool benefitable;
    }
    
    struct StakeInfo {
        uint256 amount;
        uint256 stakedAt;
        StakerRights rights;
    }

    mapping(address => StakeInfo) private stakedUsers;

    event Staked(address indexed user, uint256 amount);
    event UnStaked(address indexed user, uint256 amount);
    event RightsClaimed(address indexed user, StakerRights rights);

    constructor(address stakingToken_) Ownable(msg.sender) {
        stakingToken = IERC20(stakingToken_);
    }

    modifier onlyStaker() {
        if (msg.sender == owner()) revert Errors.OwnerNotAllowed();
        _;
    }

    /*
    External Functions
    */

    function stake(uint256 amount) external onlyStaker {
        // Check if the amount is positive
        if (amount <= 0) revert Errors.NonPositiveAmount(amount);

        stakingToken.transferFrom(msg.sender, address(this), amount);

        // Update the total staked amount in the contract
        totalStaked += amount;

        // Update the user's stake info
        if (stakedUsers[msg.sender].amount == 0) {
            stakedUsers[msg.sender].stakedAt = block.timestamp;
        } else {
            stakedUsers[msg.sender].stakedAt = _computeStakeAt(stakedUsers[msg.sender], amount);
        }
        stakedUsers[msg.sender].amount += amount;
        stakedUsers[msg.sender].rights = _computeStakerRight(stakedUsers[msg.sender]);

        // Emit the staked event if successfully staked
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external onlyStaker {
        // Check if the amount is positive
        if (amount <= 0) revert Errors.NonPositiveAmount(amount);

        // Check if the user has enough stake
        if (stakedUsers[msg.sender].amount < amount) revert Errors.InsufficientStake(stakedUsers[msg.sender].amount, amount);

        // Update the total staked amount in the contract
        totalStaked -= amount;

        // Update the user's stake info
        stakedUsers[msg.sender].amount -= amount;
        stakedUsers[msg.sender].rights = _computeStakerRight(stakedUsers[msg.sender]);

        // Emit the unstaked event if successfully unstaked
        emit UnStaked(msg.sender, amount);
    }

    function claimRights() external onlyStaker {
        StakeInfo memory stakeInfo = stakedUsers[msg.sender];
        // Check if the user has no stake
        if (stakeInfo.amount == 0) revert Errors.InsufficientStake(stakeInfo.amount, 0);
        
        // Update the user's rights
        stakedUsers[msg.sender].rights = _computeStakerRight(stakeInfo);
        emit RightsClaimed(msg.sender, stakedUsers[msg.sender].rights);
    }

    /*
    Getters
    */

    function getStakeInfo(address user) external view onlyOwner returns (StakeInfo memory) {
        return stakedUsers[user];
    }

    function getSelfStakeInfo() external view onlyStaker returns (StakeInfo memory) {
        return stakedUsers[msg.sender];
    }

    function getVotingPower(address user) external view onlyOwner returns (uint256) {
        StakeInfo memory s = stakedUsers[user];
        if (totalStaked == 0) return 0;
        return (s.amount * 1e18) / totalStaked;
    }

    function getSelfVotingPower() external view onlyStaker returns (uint256) {
        StakeInfo memory s = stakedUsers[msg.sender];
        if (totalStaked == 0) return 0;
        return (s.amount * 1e18) / totalStaked;
    }

    function getRights(address user) external view onlyOwner returns (StakerRights memory) {
        return stakedUsers[user].rights;
    }

    function getSelfRights() external view onlyStaker returns (StakerRights memory) {
        return stakedUsers[msg.sender].rights;
    }

    /*
    Utility Internal Functions
    */

    function _computeStakeAt(StakeInfo memory stakeInfo, uint256 addedAmount) internal view returns (uint256) {
        // If the user has no stake, do nothing
        if (stakeInfo.amount == 0) return 0;

        // If the user has no added amount, inherit the previous stakedAt
        if (addedAmount == 0) return stakeInfo.stakedAt;

        // Update the stakedAt using weighted average
        uint256 newStakeTime =
            (stakeInfo.amount * stakeInfo.stakedAt + addedAmount * block.timestamp)
            / (stakeInfo.amount + addedAmount);

        return newStakeTime;
    }

    function _computeStakerRight(StakeInfo memory stakeInfo) internal view returns (StakerRights memory) {
        StakerRights memory rights;

        // If the user has no stake, all rights are false
        if (stakeInfo.amount == 0) {
            rights.votable = false;
            rights.profitable = false;
            rights.benefitable = false;
            return rights;
        }

        /* Compute the staked duration:
         *  > 30 days to unlock votable
         *  > 60 days to unlock profitable
         *  > 90 days to unlock benefitable
         */
        uint256 stakedDuration = block.timestamp - stakeInfo.stakedAt;
        rights.votable = stakedDuration >= 30 days;
        rights.profitable = stakedDuration >= 60 days;
        rights.benefitable = stakedDuration >= 90 days;
        return rights;
    }
}

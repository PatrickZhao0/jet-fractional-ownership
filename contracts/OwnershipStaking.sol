// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;


import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IStaker } from "./interfaces/IStaker.sol";
import { IStakeable } from "./interfaces/IStakeable.sol";

contract OwnershipStaking is IStaker, IStakeable {
    IERC20 public immutable stakingToken;

    uint256 public totalStaked;

    mapping(address => StakeInfo) private stakedUsers;

    error NonPositiveAmount(uint256 amount);
    error InsufficientStake(uint256 balance, uint256 attempted);
    error OwnerNotAllowed();
    error TransferFailed();

    event Staked(address indexed user, uint256 amount);
    event UnStaked(address indexed user, uint256 amount);
    event RightsClaimed(address indexed user, StakerRights rights);

    constructor(address stakingToken_) {
        stakingToken = IERC20(stakingToken_);
    }

    /*
    External Functions
    */

    function stake(uint256 amount) external {
        // Check if the amount is positive
        if (amount <= 0) revert NonPositiveAmount(amount);

        bool success = stakingToken.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

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

    function unstake(uint256 amount) external {
        // Check if the amount is positive
        if (amount <= 0) revert NonPositiveAmount(amount);

        // Check if the user has enough stake
        if (stakedUsers[msg.sender].amount < amount) revert InsufficientStake(stakedUsers[msg.sender].amount, amount);

        // Update the total staked amount in the contract
        totalStaked -= amount;

        // Update the user's stake info
        stakedUsers[msg.sender].amount -= amount;
        stakedUsers[msg.sender].rights = _computeStakerRight(stakedUsers[msg.sender]);

        if (stakedUsers[msg.sender].amount == 0) {
            stakedUsers[msg.sender].stakedAt = 0;
            stakedUsers[msg.sender].rights = StakerRights(false, false, false);
        }

        bool success = stakingToken.transfer(msg.sender, amount);
        if (!success) revert TransferFailed();

        // Emit the unstaked event if successfully unstaked
        emit UnStaked(msg.sender, amount);
    }

    function claimRights() external {
        StakeInfo memory stakeInfo = stakedUsers[msg.sender];
        // Check if the user has no stake
        if (stakeInfo.amount == 0) revert InsufficientStake(stakeInfo.amount, 0);
        
        // Update the user's rights
        stakedUsers[msg.sender].rights = _computeStakerRight(stakeInfo);
        emit RightsClaimed(msg.sender, stakedUsers[msg.sender].rights);
    }

    /*
    Getters
    */

    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return stakedUsers[user];
    }

    function getVotingPower(address user) external view returns (uint256) {
        StakeInfo memory s = stakedUsers[user];
        if (totalStaked == 0) return 0;
        return (s.amount * 1e18) / totalStaked;
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

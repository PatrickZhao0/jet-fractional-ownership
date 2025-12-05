// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IOwnershipStaking } from "./interfaces/IOwnershipStaking.sol";

contract DividendDistribution is Ownable, ReentrancyGuard {
    
    IERC20 public immutable usdt;
    address public stakingContract;

    uint256 public currentRoundIndex;          // Current round index (starts from 1)
    uint256 public currentRoundRewardPerShare; // Rewards per share for the current round (1e18 precision)
    bool public isRoundActive;                 // Whether the current round is active for claiming

    mapping(address => uint256) private usersLastClaimedRound;

    uint256 constant PRECISION = 1e18;


    event RoundStarted(uint256 indexed roundId, uint256 totalReward, uint256 rewardPerShare);
    event RewardClaimed(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    error TransferFailed();
    error NoProfitableRight(); // Not profitable yet (e.g., <60 days)
    error DoubleClaimed();
    error RoundNotActive();
    error NoStakers();
    error InvalidAddress();

    constructor(address _usdt, address _stakingContract) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        stakingContract = _stakingContract;
        currentRoundIndex = 0;
    }


    function startNewRound() external onlyOwner {
        // Get total USDT balance
        uint256 currentBalance = usdt.balanceOf(address(this));
        
        // Get total staked amount
        uint256 totalStaked = IOwnershipStaking(stakingContract).totalStaked();
        if (totalStaked == 0) revert NoStakers();

        // Increment round index
        currentRoundIndex++;
        
        // Calculate reward per share
        currentRoundRewardPerShare = (currentBalance * PRECISION) / totalStaked;
        
        isRoundActive = true;

        emit RoundStarted(currentRoundIndex, currentBalance, currentRoundRewardPerShare / PRECISION);
    }


    function claim() external nonReentrant {
        if (!isRoundActive) revert RoundNotActive();

        // Check if already claimed for this round
        if (usersLastClaimedRound[msg.sender] == currentRoundIndex) {
            revert DoubleClaimed();
        }

        // Get user stake info
        IOwnershipStaking.StakeInfo memory stakeInfo = IOwnershipStaking(stakingContract).getStakeInfo(msg.sender);
        
        // Check eligibility (Profitable)
        if (!stakeInfo.rights.profitable) revert NoProfitableRight();
    
        // Calculate reward for this round
        uint256 reward = (stakeInfo.amount * currentRoundRewardPerShare) / PRECISION;

        // Mark as claimed
        usersLastClaimedRound[msg.sender] = currentRoundIndex;

        // Transfer rewards
        if (reward > 0) {
            bool success = usdt.transfer(msg.sender, reward);
            if (!success) revert TransferFailed();
            emit RewardClaimed(msg.sender, reward);
        }
    }

    // Check claimable amount for the current round
    function checkCurrentRoundReward(address user) external view returns (uint256) {
        // return 0 if round is not active
        if (!isRoundActive) return 0;
        // return 0 if user has already claimed this round
        if (usersLastClaimedRound[user] == currentRoundIndex) return 0;

        IOwnershipStaking.StakeInfo memory stakeInfo = IOwnershipStaking(stakingContract).getStakeInfo(user);
        
        if (!stakeInfo.rights.profitable) return 0;
        return (stakeInfo.amount * currentRoundRewardPerShare) / PRECISION;
    }

    // transfer revenue out of the contract
    function transferRevenueOut(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) return;

        uint256 balance = usdt.balanceOf(address(this));
        if (balance < amount) revert TransferFailed(); 
        bool success = usdt.transfer(to, amount);
        if (!success) revert TransferFailed();
        emit EmergencyWithdraw(to, amount);
    }
}
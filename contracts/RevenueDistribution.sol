// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Interface: Read Staking contract data
interface IOwnershipStaking {
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
    // Read user's current stake info
    function getStakeInfo(address user) external view returns (StakeInfo memory);
    // Read current total staked amount
    function totalStaked() external view returns (uint256);
}

contract RevenueDistribution is Ownable, ReentrancyGuard {
    
    IERC20 public immutable usdt;
    address public stakingContract;

    // --- Round Control Variables ---
    uint256 public currentRoundIndex;          // Current round index (starts from 1)
    uint256 public currentRoundRewardPerShare; // Rewards per share for the current round (1e12 precision)
    bool public isRoundActive;                 // Whether the current round is active for claiming

    // --- User State ---
    // Record the last round index the user claimed
    mapping(address => uint256) public userLastClaimedRound;

    uint256 constant PRECISION = 1e12;

    // --- Events ---
    event RevenueDeposited(uint256 amount);
    event RoundStarted(uint256 indexed roundId, uint256 totalReward, uint256 rewardPerShare);
    event RewardClaimed(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    // --- Errors ---
    error TransferFailed();
    error NotProfitableYet(); // Not profitable yet (e.g., <60 days)
    error AlreadyClaimedThisRound();
    error RoundNotActive();
    error NoStakers();
    error InvalidAddress();

    constructor(address _usdt, address _stakingContract) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        stakingContract = _stakingContract;
        currentRoundIndex = 0; // Initial state
    }


    // 1. Deposit Revenue (Called by JetUtilityToken or anyone)
    // Function to receive funds; funds accumulate in the contract balance for the next round
    function depositRevenue(uint256 amount) external {
        if (amount == 0) return;
        
        // Transfer funds
        bool success = usdt.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        
        emit RevenueDeposited(amount);
    }


    // 2. Start New Round (Called by Owner)
    function startNewRound() external onlyOwner {
        // A. Get total USDT balance (New revenue + Rollover)
        uint256 currentBalance = usdt.balanceOf(address(this));
        
        // B. Get total staked amount
        uint256 totalStaked = IOwnershipStaking(stakingContract).totalStaked();
        if (totalStaked == 0) revert NoStakers();

        // C. Increment round index
        currentRoundIndex++;
        
        // D. Calculate reward per share
        // Logic: Distribute current total balance to current total staked
        currentRoundRewardPerShare = (currentBalance * PRECISION) / totalStaked;
        
        isRoundActive = true;

        emit RoundStarted(currentRoundIndex, currentBalance, currentRoundRewardPerShare);
    }

    // 3. Claim Rewards (Round-based)
    function claim() external nonReentrant {
        if (!isRoundActive) revert RoundNotActive();

        // A. Check if already claimed for this round
        if (userLastClaimedRound[msg.sender] == currentRoundIndex) {
            revert AlreadyClaimedThisRound();
        }

        // B. Get user stake info
        IOwnershipStaking.StakeInfo memory stakeInfo = IOwnershipStaking(stakingContract).getStakeInfo(msg.sender);
        
        // C. Check eligibility (Profitable)
        if (!stakeInfo.rights.profitable) revert NotProfitableYet();
    
        // D. Calculate reward for this round
        // Use current stake * current RPS (Previous rounds ignored)
        uint256 reward = (stakeInfo.amount * currentRoundRewardPerShare) / PRECISION;

        // E. Mark as claimed
        userLastClaimedRound[msg.sender] = currentRoundIndex;

        // F. Transfer rewards
        if (reward > 0) {
            bool success = usdt.transfer(msg.sender, reward);
            if (!success) revert TransferFailed();
            emit RewardClaimed(msg.sender, reward);
        }
    }

    // Check claimable amount for the current round
    function checkCurrentRoundReward(address user) external view returns (uint256) {
        if (!isRoundActive) return 0;
        if (userLastClaimedRound[user] == currentRoundIndex) return 0; // Already claimed

        IOwnershipStaking.StakeInfo memory stakeInfo = IOwnershipStaking(stakingContract).getStakeInfo(user);
        
        if (!stakeInfo.rights.profitable) return 0;

        return (stakeInfo.amount * currentRoundRewardPerShare) / PRECISION;
    }

    // transfer USDT
    function transferUSDT(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) return;

        uint256 balance = usdt.balanceOf(address(this));
        if (balance < amount) revert TransferFailed(); 
        bool success = usdt.transfer(to, amount);
        if (!success) revert TransferFailed();

        emit EmergencyWithdraw(to, amount);
    }
}
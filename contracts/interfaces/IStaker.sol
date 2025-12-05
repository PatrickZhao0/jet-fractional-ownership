// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IStaker {
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
    function totalStaked() external view returns (uint256);
    function getStakeInfo(address user) external view returns (StakeInfo memory);
    function getVotingPower(address user) external view returns (uint256);
}

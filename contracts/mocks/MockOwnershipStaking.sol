// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IOwnershipStaking } from "../interfaces/IOwnershipStaking.sol";

contract MockOwnershipStaking is IOwnershipStaking {

    uint PERCENT = 1e18;

    mapping(address => StakeInfo) private stakedUsers;
    mapping(address => uint256) private votingPowers;


    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return stakedUsers[user];
    }

    function setStakeInfo(address user, StakeInfo memory stakeInfo) external {
        stakedUsers[user] = stakeInfo;
    }

    function getVotingPower(address user) external view returns (uint256) {
        return votingPowers[user];
    }

    function setVotingPower(address user, uint256 votingPower_) external {
        votingPowers[user] = votingPower_;
    }
}
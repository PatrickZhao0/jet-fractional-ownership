// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IStaker } from "../interfaces/IStaker.sol";

contract MockOwnershipStaking is IStaker {

    mapping(address => StakeInfo) private stakedUsers;
    mapping(address => uint256) private votingPowers;

    uint256 private _totalStaked;

    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return stakedUsers[user];
    }
    function getVotingPower(address user) external view returns (uint256) {
        return votingPowers[user];
    }
    
    function setStakeInfo(address user, StakeInfo memory stakeInfo) external {
        stakedUsers[user] = stakeInfo;
    }
    function setVotingPower(address user, uint256 votingPower_) external {
        votingPowers[user] = votingPower_;
    }

    function totalStaked() external view returns (uint256) {
        return _totalStaked;
    }

    function setMockData(address user, uint256 amount, bool isProfitable) external {
        _totalStaked = _totalStaked - stakedUsers[user].amount + amount;
        stakedUsers[user].amount = amount;
        stakedUsers[user].rights.profitable = isProfitable;
    }
}
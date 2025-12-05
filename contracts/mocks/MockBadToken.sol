// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// A Token Mocking Transfer Failure.
contract MockBadToken {
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false; 
    }
    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
    function allowance(address, address) external pure returns (uint256) { return 100000000 ether; }
    function balanceOf(address) external pure returns (uint256) { return 100000000 ether; }
}
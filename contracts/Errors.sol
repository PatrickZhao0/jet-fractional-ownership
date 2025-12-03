// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Errors {
    error NonPositiveAmount(uint256 amount);
    error InsufficientStake(uint256 balance, uint256 attempted);
    error OwnerNotAllowed();
}
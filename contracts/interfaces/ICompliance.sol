// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICompliance {
    function kycVerified(address user) external view returns (bool);
    function addKYC(address[] calldata users) external;
    function removeKYC(address[] calldata users) external;
}

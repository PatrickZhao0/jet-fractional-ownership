// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ICompliance.sol";

error EmptyList();
error NotKYCVerified(address user);

contract Compliance is Ownable, ICompliance {

    mapping(address => bool) public kycVerified;

    event KYCBatchUpdated(address[] users, bool status);

    constructor(address _owner) Ownable(_owner) {}

    function addKYC(address[] calldata users) external onlyOwner {
        _updateKYCStatus(users, true);
    }

    function removeKYC(address[] calldata users) external onlyOwner {
        _updateKYCStatus(users, false);
    }

    function _updateKYCStatus(address[] calldata users, bool status) private {
        if (users.length == 0) revert EmptyList();

        address[] memory changed = new address[](users.length);
        uint256 count = 0;

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            if (user == address(0)) continue;
            if (kycVerified[user] == status) continue;
            kycVerified[user] = status;
            changed[count] = user;
            count++;
        }

        if (count > 0) {
            assembly {
                mstore(changed, count)
            }
            emit KYCBatchUpdated(changed, status);
        }
    }
}

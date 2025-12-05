// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IStaker } from "./IStaker.sol";
import { IStakeable } from "./IStakeable.sol";

interface IOwnershipStaking is IStaker, IStakeable {
}

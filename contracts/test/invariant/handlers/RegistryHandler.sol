// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {SetCodeRegistry} from "../../../src/SetCodeRegistry.sol";

/// @notice Handler for SetCodeRegistry invariant testing. Calls only succeed on valid
///         preconditions so that fail_on_revert can stay enabled.
contract RegistryHandler is CommonBase, StdCheats, StdUtils {
    SetCodeRegistry public immutable REGISTRY;
    address public immutable ADMIN;
    address public immutable CLASSIFIER;

    address[5] internal targets;

    mapping(address => bool) public wasEverMalicious;
    mapping(address => bool) public wasExplicitlyDowngraded;

    uint256 public classifyCalls;
    uint256 public downgradeCalls;

    constructor(SetCodeRegistry _registry, address _admin, address _classifier) {
        REGISTRY = _registry;
        ADMIN = _admin;
        CLASSIFIER = _classifier;
        targets[0] = makeAddr("t0");
        targets[1] = makeAddr("t1");
        targets[2] = makeAddr("t2");
        targets[3] = makeAddr("t3");
        targets[4] = makeAddr("t4");
    }

    function getTargets() external view returns (address[5] memory) {
        return targets;
    }

    function classifyAsClassifier(uint256 targetSeed, uint8 newC) external {
        address target = _pickTarget(targetSeed);
        SetCodeRegistry.Classification current = REGISTRY.classificationOf(target);
        if (current == SetCodeRegistry.Classification.Malicious) return;
        uint8 bounded = uint8(bound(newC, 0, 2));
        SetCodeRegistry.Classification next = SetCodeRegistry.Classification(bounded);
        if (next == current) return;

        vm.prank(CLASSIFIER);
        REGISTRY.classify(target, next, "inv");
        classifyCalls++;
        if (next == SetCodeRegistry.Classification.Malicious) wasEverMalicious[target] = true;
    }

    function downgradeMaliciousAsAdmin(uint256 targetSeed, uint8 newC) external {
        address target = _pickTarget(targetSeed);
        if (REGISTRY.classificationOf(target) != SetCodeRegistry.Classification.Malicious) return;
        uint8 bounded = uint8(bound(newC, 0, 1));
        SetCodeRegistry.Classification next = SetCodeRegistry.Classification(bounded);

        vm.prank(ADMIN);
        REGISTRY.downgradeMalicious(target, next, "inv");
        downgradeCalls++;
        wasExplicitlyDowngraded[target] = true;
    }

    function _pickTarget(uint256 seed) internal view returns (address) {
        return targets[seed % targets.length];
    }
}

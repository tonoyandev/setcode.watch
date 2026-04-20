// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SetCodeRegistry} from "../../src/SetCodeRegistry.sol";
import {RegistryHandler} from "./handlers/RegistryHandler.sol";

contract SetCodeRegistryInvariantTest is Test {
    SetCodeRegistry internal registry;
    RegistryHandler internal handler;

    address internal admin = makeAddr("invariantAdmin");
    address internal classifier = makeAddr("invariantClassifier");

    function setUp() public {
        registry = new SetCodeRegistry(admin);
        vm.prank(admin);
        registry.grantRole(keccak256("CLASSIFIER_ROLE"), classifier);

        handler = new RegistryHandler(registry, admin, classifier);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = RegistryHandler.classifyAsClassifier.selector;
        selectors[1] = RegistryHandler.downgradeMaliciousAsAdmin.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @notice A target that was ever set to Malicious cannot silently end up non-Malicious
    ///         without an explicit downgrade call.
    function invariant_classificationMonotonic() public view {
        address[5] memory targets = handler.getTargets();
        for (uint256 i; i < targets.length; i++) {
            address t = targets[i];
            if (!handler.wasEverMalicious(t)) continue;
            if (handler.wasExplicitlyDowngraded(t)) continue;
            assertEq(
                uint8(registry.classificationOf(t)),
                uint8(SetCodeRegistry.Classification.Malicious),
                "malicious state decayed without explicit downgrade"
            );
        }
    }

    /// @notice Only accounts holding CLASSIFIER_ROLE or DEFAULT_ADMIN_ROLE could have
    ///         produced the current state. The handler enforces this by only ever using
    ///         those pranked identities; this invariant confirms the role grants stayed
    ///         stable.
    function invariant_onlyAuthorizedActorsCanWrite() public view {
        assertTrue(registry.hasRole(0x00, admin));
        assertTrue(registry.hasRole(keccak256("CLASSIFIER_ROLE"), classifier));
    }
}

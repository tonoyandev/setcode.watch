// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {SetCodeRegistry} from "../../src/SetCodeRegistry.sol";

contract SetCodeRegistryUnitTest is Test {
    SetCodeRegistry internal registry;
    address internal admin = makeAddr("admin");
    address internal classifier = makeAddr("classifier");
    address internal stranger = makeAddr("stranger");
    address internal target = makeAddr("target");

    bytes32 internal constant CLASSIFIER_ROLE = keccak256("CLASSIFIER_ROLE");
    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;

    event Classified(address indexed target, SetCodeRegistry.Classification indexed classification, string reason);
    event MaliciousDowngraded(
        address indexed target, SetCodeRegistry.Classification indexed newClassification, string reason
    );

    function setUp() public {
        registry = new SetCodeRegistry(admin);
        vm.prank(admin);
        registry.grantRole(CLASSIFIER_ROLE, classifier);
    }

    function test_constructor_grantsAdminAndClassifierRoles() public view {
        assertTrue(registry.hasRole(DEFAULT_ADMIN_ROLE, admin));
        assertTrue(registry.hasRole(CLASSIFIER_ROLE, admin));
    }

    function test_initialClassification_isUnknown() public view {
        assertEq(uint8(registry.classificationOf(target)), uint8(SetCodeRegistry.Classification.Unknown));
    }

    function test_classify_setsVerified() public {
        vm.expectEmit(true, true, true, true);
        emit Classified(target, SetCodeRegistry.Classification.Verified, "audited");
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "audited");
        assertEq(uint8(registry.classificationOf(target)), uint8(SetCodeRegistry.Classification.Verified));
    }

    function test_classify_revertsWhenNotClassifier() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, CLASSIFIER_ROLE)
        );
        vm.prank(stranger);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "");
    }

    function test_classify_revertsOnSameClassification() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "");
        vm.expectRevert(SetCodeRegistry.SameClassification.selector);
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "");
    }

    function test_classify_revertsOnNoOpToUnknown() public {
        vm.expectRevert(SetCodeRegistry.SameClassification.selector);
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Unknown, "");
    }

    function test_classify_canEscalateVerifiedToMalicious() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "");
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Malicious, "compromised");
        assertEq(uint8(registry.classificationOf(target)), uint8(SetCodeRegistry.Classification.Malicious));
    }

    function test_classify_revertsWhenMoviongOutOfMalicious() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Malicious, "");
        vm.expectRevert(SetCodeRegistry.CannotDowngradeMalicious.selector);
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "");
    }

    function test_downgradeMalicious_setsUnknown() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Malicious, "");
        vm.expectEmit(true, true, true, true);
        emit MaliciousDowngraded(target, SetCodeRegistry.Classification.Unknown, "false positive");
        vm.prank(admin);
        registry.downgradeMalicious(target, SetCodeRegistry.Classification.Unknown, "false positive");
        assertEq(uint8(registry.classificationOf(target)), uint8(SetCodeRegistry.Classification.Unknown));
    }

    function test_downgradeMalicious_setsVerified() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Malicious, "");
        vm.prank(admin);
        registry.downgradeMalicious(target, SetCodeRegistry.Classification.Verified, "re-audited");
        assertEq(uint8(registry.classificationOf(target)), uint8(SetCodeRegistry.Classification.Verified));
    }

    function test_downgradeMalicious_revertsWhenNotAdmin() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Malicious, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, classifier, DEFAULT_ADMIN_ROLE
            )
        );
        vm.prank(classifier);
        registry.downgradeMalicious(target, SetCodeRegistry.Classification.Unknown, "");
    }

    function test_downgradeMalicious_revertsWhenNotCurrentlyMalicious() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Verified, "");
        vm.expectRevert(SetCodeRegistry.NotCurrentlyMalicious.selector);
        vm.prank(admin);
        registry.downgradeMalicious(target, SetCodeRegistry.Classification.Unknown, "");
    }

    function test_downgradeMalicious_revertsWhenDowngradingToMalicious() public {
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification.Malicious, "");
        vm.expectRevert(SetCodeRegistry.CannotDowngradeToMalicious.selector);
        vm.prank(admin);
        registry.downgradeMalicious(target, SetCodeRegistry.Classification.Malicious, "");
    }

    function testFuzz_classify_acceptsAllValidClassifications(uint8 raw) public {
        uint8 c = uint8(bound(raw, 0, 2));
        if (c == uint8(SetCodeRegistry.Classification.Unknown)) return;
        vm.prank(classifier);
        registry.classify(target, SetCodeRegistry.Classification(c), "fuzz");
        assertEq(uint8(registry.classificationOf(target)), c);
    }

    function testFuzz_nonClassifier_cannotWrite(address caller, uint8 c) public {
        vm.assume(caller != admin && caller != classifier);
        uint8 bounded = uint8(bound(c, 0, 2));
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, caller, CLASSIFIER_ROLE)
        );
        vm.prank(caller);
        registry.classify(target, SetCodeRegistry.Classification(bounded), "");
    }
}

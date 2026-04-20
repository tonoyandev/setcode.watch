// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {DelegationCanary} from "../../src/DelegationCanary.sol";

contract DelegationCanaryUnitTest is Test {
    DelegationCanary internal canary;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event Subscribed(address indexed eoa, bytes32 channelHash);
    event Unsubscribed(address indexed eoa);

    function setUp() public {
        canary = new DelegationCanary();
    }

    function test_subscribe_emitsEventWithSender() public {
        bytes32 hash = keccak256("channel-1");
        vm.expectEmit(true, false, false, true);
        emit Subscribed(alice, hash);
        vm.prank(alice);
        canary.subscribe(hash);
    }

    function test_subscribe_revertsOnZeroHash() public {
        vm.expectRevert(DelegationCanary.ZeroHash.selector);
        vm.prank(alice);
        canary.subscribe(bytes32(0));
    }

    function test_unsubscribe_emitsEventWithSender() public {
        vm.expectEmit(true, false, false, false);
        emit Unsubscribed(alice);
        vm.prank(alice);
        canary.unsubscribe();
    }

    /// @notice Guard against an accidental `tx.origin` indexing regression.
    ///         In a 7702/4337 world tx.origin != msg.sender is common, and
    ///         indexing the wrong one would break downstream subscription matching.
    function test_subscribe_indexesMsgSenderNotTxOrigin() public {
        bytes32 hash = keccak256("guard");
        vm.recordLogs();
        vm.prank(alice, bob); // msg.sender = alice, tx.origin = bob
        canary.subscribe(hash);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "expected one event");
        assertEq(logs[0].topics[0], keccak256("Subscribed(address,bytes32)"));
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice, "indexed eoa must be msg.sender");
    }

    function test_unsubscribe_indexesMsgSenderNotTxOrigin() public {
        vm.recordLogs();
        vm.prank(alice, bob);
        canary.unsubscribe();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], keccak256("Unsubscribed(address)"));
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice);
    }

    /// @notice Event signatures are a public API contract with the indexer.
    ///         This test locks them in so a rename or param-reorder is
    ///         caught at PR time rather than as a silent indexer regression.
    function test_eventSignatures_arePinned() public pure {
        assertEq(
            keccak256("Subscribed(address,bytes32)"), 0x3e8901f9ef2d2a2a75af91d229b1ab4c4530ff19a91e142a22249976b4f9fdb2
        );
        assertEq(keccak256("Unsubscribed(address)"), 0xae563681ccc696fae58fe830f401bc9c043a43ddb9f7c2830b32c3c70d9966e7);
    }

    function testFuzz_subscribe_anyNonZeroHash(bytes32 hash) public {
        vm.assume(hash != bytes32(0));
        vm.expectEmit(true, false, false, true);
        emit Subscribed(alice, hash);
        vm.prank(alice);
        canary.subscribe(hash);
    }

    function testFuzz_subscribe_anySender(address caller, bytes32 hash) public {
        vm.assume(hash != bytes32(0));
        vm.assume(caller != address(0));
        vm.expectEmit(true, false, false, true);
        emit Subscribed(caller, hash);
        vm.prank(caller);
        canary.subscribe(hash);
    }

    function testFuzz_unsubscribe_anySender(address caller) public {
        vm.assume(caller != address(0));
        vm.expectEmit(true, false, false, false);
        emit Unsubscribed(caller);
        vm.prank(caller);
        canary.unsubscribe();
    }
}

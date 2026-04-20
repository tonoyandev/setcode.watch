// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DelegationCanary
/// @notice Advisory on-chain signal for SetCode.watch monitoring subscriptions.
/// @dev Stateless, emit-only. Actual subscription state lives off-chain in the
///      watcher. These events are a censorship-resistant intent channel for
///      users who want a public record of their subscription.
///
///      IMPORTANT: Events from this contract alone do NOT guarantee alerts
///      will be sent. A matching off-chain subscription (via the Telegram
///      confirmation flow) is still required for delivery.
///
///      ERC-4337 note: when called via a UserOp, msg.sender is the EntryPoint,
///      not the EOA. Call this contract directly from the EOA, or integrate
///      at the smart-account module layer. An EIP-712 auth path may be added
///      in a future version.
contract DelegationCanary {
    /// @notice Intent-to-subscribe signal from `eoa`.
    /// @param eoa The caller (msg.sender).
    /// @param channelHash Opaque identifier computed off-chain; the contract
    ///        never sees plaintext channel data.
    ///        Recommended construction: keccak256(abi.encode(chatId, chainId, salt)).
    ///        The salt prevents offline reverse-lookup of known chatIds.
    ///        TODO(privacy): document canonical hash schema in docs/ARCHITECTURE.md.
    event Subscribed(address indexed eoa, bytes32 channelHash);

    /// @notice Intent-to-unsubscribe signal from `eoa`. Removes all subscriptions
    ///         associated with the caller at the watcher's discretion.
    event Unsubscribed(address indexed eoa);

    error ZeroHash();

    /// @notice Emit a subscription intent for msg.sender.
    /// @param channelHash Opaque identifier (see {Subscribed}).
    function subscribe(bytes32 channelHash) external {
        if (channelHash == bytes32(0)) revert ZeroHash();
        emit Subscribed(msg.sender, channelHash);
    }

    /// @notice Emit an unsubscription intent for msg.sender.
    function unsubscribe() external {
        emit Unsubscribed(msg.sender);
    }
}

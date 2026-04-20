// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SetCodeRegistry
/// @notice Governance-controlled registry of EIP-7702 delegation-target classifications.
/// @dev Malicious is a sticky state; downgrades require a separate, admin-only path that
///      emits a distinct event so off-chain consumers can treat it as an explicit policy
///      reversal rather than silent churn.
contract SetCodeRegistry is AccessControl {
    enum Classification {
        Unknown,
        Verified,
        Malicious
    }

    bytes32 public constant CLASSIFIER_ROLE = keccak256("CLASSIFIER_ROLE");

    mapping(address target => Classification) private _classifications;

    event Classified(address indexed target, Classification indexed classification, string reason);

    event MaliciousDowngraded(address indexed target, Classification indexed newClassification, string reason);

    error SameClassification();
    error CannotDowngradeMalicious();
    error NotCurrentlyMalicious();
    error CannotDowngradeToMalicious();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLASSIFIER_ROLE, admin);
    }

    /// @notice Classify a delegation target. Rejects no-op writes and forward moves out of Malicious.
    /// @dev Moving a target out of Malicious requires {downgradeMalicious}.
    function classify(address target, Classification c, string calldata reason) external onlyRole(CLASSIFIER_ROLE) {
        Classification current = _classifications[target];
        if (current == c) revert SameClassification();
        if (current == Classification.Malicious) revert CannotDowngradeMalicious();
        _classifications[target] = c;
        emit Classified(target, c, reason);
    }

    /// @notice Explicitly downgrade a target currently marked Malicious.
    /// @dev Admin-only, distinct event. Downgrading to Malicious is rejected (use for no reason).
    function downgradeMalicious(address target, Classification newClassification, string calldata reason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (_classifications[target] != Classification.Malicious) {
            revert NotCurrentlyMalicious();
        }
        if (newClassification == Classification.Malicious) revert CannotDowngradeToMalicious();
        _classifications[target] = newClassification;
        emit MaliciousDowngraded(target, newClassification, reason);
    }

    /// @notice Read the current classification of a target. Unregistered targets return Unknown.
    function classificationOf(address target) external view returns (Classification) {
        return _classifications[target];
    }
}

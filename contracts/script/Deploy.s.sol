// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SetCodeRegistry} from "../src/SetCodeRegistry.sol";

contract DeployRegistry is Script {
    function run() external returns (SetCodeRegistry registry) {
        address admin = vm.envAddress("REGISTRY_ADMIN_ADDRESS");
        vm.startBroadcast();
        registry = new SetCodeRegistry(admin);
        vm.stopBroadcast();
        console2.log("SetCodeRegistry deployed at:", address(registry));
        console2.log("Admin:", admin);
    }
}

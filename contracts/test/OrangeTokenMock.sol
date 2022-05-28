//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OrangeTokenMock is ERC20 {
    constructor() ERC20("Orange Token Mock", "OTM") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

pragma solidity ^0.5.7;

import "../../../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "../../../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

/// @notice A test ERC20 token with 12 decimals.
contract ImpreciseToken is ERC20, ERC20Detailed {

    string private constant _name = "Imprecise Token"; // solium-disable-line uppercase
    string private constant _symbol = "IPT"; // solium-disable-line uppercase
    uint8 private constant _decimals = 9; // solium-disable-line uppercase

    uint256 public constant INITIAL_SUPPLY = 1000000000 * (10 ** uint256(_decimals));

    /**
    * @dev Constructor that gives msg.sender all of existing tokens.
    */
    /// @notice The RenToken Constructor.
    constructor() ERC20Detailed(_name, _symbol, _decimals) ERC20() public {
        _mint(msg.sender, INITIAL_SUPPLY);
    }


}
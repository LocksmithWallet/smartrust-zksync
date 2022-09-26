// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard and be able to ugprade
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

// We want the contract to be ownable by the deployer - only they can set the
// locksmith.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Required for Upgradeable Contracts
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// UUPS Proxy Standard
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
///////////////////////////////////////////////////////////

/**
 * KeyVault 
 *
 * This simple contract is where the ERC1155s are minted and burned.
 * It has no knowledge of the rest of the system, and is used to
 * contain the tokenziation of the keys only.
 *
 * Only the contract deployer and any associated minters (locksmith's)
 * can manage the keys.
 */
contract KeyVault is Initializable, ERC1155Upgradeable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Events
    ///////////////////////////////////////////////////////
    
    /**
     * setSoulboundKeyAmount 
     *
     * This event fires when the state of a soulbind key is set.
     *
     * @param operator  the person making the change, should be the locksmith
     * @param keyHolder the 'soul' we are changing the binding for
     * @param keyId     the Id we are setting the binding state for
     * @param amount    the number of tokens this person must hold
     */
    event setSoulboundKeyAmount(address operator, address keyHolder, 
        uint256 keyId, uint256 amount); 


    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    address public respectedLocksmith;

    // The respected locksmith can mint and burn tokens, as
    // well as bind specific keys to wallets and prevent the
    // vault from enabling transfers. This prpevents contracts
    // and delinquent key holders from moving their NFT
    // or having it stolen out of their wallet.
    // wallet / keyId => amount
    mapping(address => mapping(uint256 => uint256)) public soulboundKeyAmounts;

    ///////////////////////////////////////////////////////
    // Constructor and Upgrade Methods
    //
    // This section is specifically for upgrades and inherited
    // override functionality.
    ///////////////////////////////////////////////////////
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        // and locks the contract for anyone but the owner
        _disableInitializers();
    }

     /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     *
     */
    function initialize() initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

     /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * //UNUSED -param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address) internal view onlyOwner override {}

    ////////////////////////////////////////////////////////
    // Owner methods
    //
    // Only the contract owner can call these 
    ////////////////////////////////////////////////////////

    /**
     * setRespectedLocksmith
     *
     * Only the owner can call this method, to set
     * the key vault owner to a specific locksmith.
     *
     * @param locksmith the address of the locksmith to respect
     */
    function setRespectedLocksmith(address locksmith) onlyOwner external {
        respectedLocksmith = locksmith;
    }

    ////////////////////////////////////////////////////////
    // Locksmith methods 
    //
    // Only the anointed locksmith can call these. 
    ////////////////////////////////////////////////////////
    
    /**
     * mint 
     *
     * Only the locksmith can mint keys. 
     *
     * @param receiver   the address to send the new key to 
     * @param keyId      the ERC1155 NFT ID you want to mint 
     * @param amount     the number of keys you want to mint to the receiver
     * @param data       the data field for the key 
     */
    function mint(address receiver, uint256 keyId, uint256 amount, bytes calldata data) external {
        require(respectedLocksmith == msg.sender, "NOT_LOCKSMITH");
        _mint(receiver, keyId, amount, data);
    }

    /**
     * soulbind
     *
     * The locksmith can call this method to ensure that the current
     * key-holder of a specific address cannot exchange or move a certain
     * amount of keys from their wallets. Essentially it will prevent
     * transfers.
     *
     * In the average case, this is on behalf of the root key holder of
     * a trust. 
     *
     * It is safest to soulbind in the same transaction as the minting.
     * This function does not check if the keyholder holds the amount of
     * tokens. And this function is SETTING the soulbound amount. It is
     * not additive.
     *
     * @param keyHolder the current key-holder
     * @param keyId     the key id to bind to the keyHolder
     * @param amount    it could be multiple depending on the use case
     */
    function soulbind(address keyHolder, uint256 keyId, uint256 amount) external {
        // respect only the locksmith in this call
        require(respectedLocksmith == msg.sender, "NOT_LOCKSMITH");

        // here ya go boss
        soulboundKeyAmounts[keyHolder][keyId] = amount;
        emit setSoulboundKeyAmount(msg.sender, keyHolder, keyId, amount); 
    }

    /**
     * burn 
     *
     * We want to provide some extra functionality to allow the Locksmith
     * to burn Trust Keys on behalf of the root key holder. While the KeyVault
     * "trusts" the locksmith, the locksmith will only call this method on behalf
     * of the root key holder.
     *
     * @param holder     the address of the key holder you want to burn from
     * @param keyId      the ERC1155 NFT ID you want to burn
     * @param burnAmount the number of said keys you want to burn from the holder's possession.
     */
    function burn(address holder, uint256 keyId, uint256 burnAmount) external {
        require(respectedLocksmith == msg.sender, "NOT_LOCKSMITH");
        _burn(holder, keyId, burnAmount);
    }
    
    ////////////////////////////////////////////////////////
    // Key Methods 
    //
    // These are overrides of the token standard that we use
    // to add additional functionalty to the keys themselves.
    ////////////////////////////////////////////////////////

    /**
     * _beforeTokenTransfer 
     *
     * This is an override for ERC1155. We are going
     * to ensure that the transfer is not tripping any
     * soulbound token amounts.
     */
    function _beforeTokenTransfer(
        address operator, address from, address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        // here we check to see if any 'from' addresses
        // would end up with too few soulbound requirements
        // at the end of the transaction.
        for(uint256 x = 0; x < ids.length; x++) {
            // we need to allow address zero during minting
            require((from == address(0)) || ((this.balanceOf(from, ids[x]) - amounts[x]) >=
                soulboundKeyAmounts[from][ids[x]]), 'SOUL_BREACH');
        }
    }
}
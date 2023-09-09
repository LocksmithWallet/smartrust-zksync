const fs = require('fs');
const { Wallet } = require("zksync-web3");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { ethers } = require("ethers");

LocksmithRegistry = (function() {
  const CONTRACTS = [ 
    'KeyVault',
    'Locksmith',
    'KeyLocker',
    'Notary',
    'Ledger',
    'EtherVault',
    'TokenVault',
    'TrustEventLog',
    'KeyOracle',
    'AlarmClock',
    'Distributor',
    'PostOffice',
    'KeyAddressFactory',
    'MegaKeyCreator',
    'TrustCreator',
    'TrustRecoveryCenter',
    'RecoveryPolicyCreator',
  ];

///////////////////////////////////////////
// patchOwner
//
// This is needed because hardhat doesn't always use EIP 1559
// when using the default JsonRPCSigner, and doesn't necessarily
// support the right over-rides in hardhat.config.js.
//
// https://github.com/NomicFoundation/hardhat/issues/3418
///////////////////////////////////////////
const patchOwner = async function() {
  const zkWallet = new Wallet(process.env.MY_PRIVATE_KEY)
  const deployer = new Deployer(hre, zkWallet);
  return deployer;
}

  /////////////////////////////////////////////
  // getNetworkRegistryFileName
  //
  // Will take a chain ID and produce the filename
  // for the registry.
  /////////////////////////////////////////////
  var getNetworkRegistryFileName = function(chainId, registryType){
    return __dirname + '/../registries/network-' + registryType + '-' + chainId + '.json';
  };
  
  /////////////////////////////////////////////
  // getNetworkRegistry
  //
  // Will take a network, and return a json file
  // loaded directly from disk with all of the deployed
  // contract addresses via their aliases, as well
  // as any known set dependencies.
  /////////////////////////////////////////////
  var getNetworkRegistry = function(chainId, registryType = 'contracts') {
    return {
      chainId: chainId,
      type: registryType,
      contracts: JSON.parse(
        fs.readFileSync(getNetworkRegistryFileName(chainId, registryType)))
    }; 
  };

  /////////////////////////////////////////////
  // commitNetworkRegistry
  //
  // Takes a registry object (which contains both a chainId and
  // a map of contract aliases and their addresses), and saves
  // it to the proper file atomically.
  /////////////////////////////////////////////
  var commitNetworkRegistry = function(registry) {
    let data = JSON.stringify(registry.contracts, null, 2);
    fs.writeFileSync(getNetworkRegistryFileName(registry.chainId, registry.type), data); 
  };

  return {
    /////////////////////////////////////////////
    // getContractList
    //
    // Produce an array of aliases you can use to
    // introspect the registry.
    /////////////////////////////////////////////
    getContractList: function() {
      return CONTRACTS;
    },
    /////////////////////////////////////////////
    // getDeployedDependencyAddress 
    //
    // Given a context of ethers, get the integrity
    // of the given contract alias.
    /////////////////////////////////////////////
    getDeployedDependencyAddress: async function(chainId, alias, dependency) {
      var owner = await patchOwner();
      var address = LocksmithRegistry.getContractAddress(chainId, alias);
      var artifact = await owner.loadArtifact(alias);

      // this is a very naughty piece of code, that assumes
      // there is a public member that is lower-camelized for
      // the contract dependency.
      // note: this has already tripped me up once with the event log dependency
      try { 
        var contract = new ethers.Contract(address, artifact.abi, owner.zkWallet);
        var method = dependency.charAt(0).toLowerCase() + dependency.slice(1);
        return address !== null ? await contract[method]() : null;
      } catch (err) {
        return null;
      }
    },
    /////////////////////////////////////////////
    // getContractAddress
    //
    // Opens the registry, and gets a specific
    // contract address given the chain Id.
    /////////////////////////////////////////////
    getContractAddress: function(chainId, alias, registryType = 'contracts') {
      return (getNetworkRegistry(chainId, registryType).contracts[alias] || {})['address'] || null; 
    },
    /////////////////////////////////////////////
    // getContractCodeHash
    //
    // Opens the registry, and gets a specific
    // contract code hash given the chain Id.
    /////////////////////////////////////////////
    getContractCodeHash: function(chainId, alias, registryType = 'contracts') {
      return (getNetworkRegistry(chainId, registryType).contracts[alias]||{})['codeHash'] || null; 
    },
    /////////////////////////////////////////////
    // saveContractAddress
    //
    // This method will take an address and store
    // it in the registry. However, it will overwrite
    // anything that is there!
    /////////////////////////////////////////////
    saveContractAddress: function(chainId, alias, address, registryType = 'contracts') {
      // this will error if the registry doesn't exist, this
      // is on purpose to ensure that typos don't create new
      // registries
      var registry = getNetworkRegistry(chainId, registryType);

      // save the registry into the map
      registry.contracts[alias] ||= {};
      registry.contracts[alias]['address'] = address;

      // save the registry
      commitNetworkRegistry(registry);
    },
    /////////////////////////////////////////////
    // saveContractCodeHash
    //
    // This method will take a code hash and store
    // it in the registry. However, it will overwrite
    // anything that is there!
    /////////////////////////////////////////////
    saveContractCodeHash: function(chainId, alias, codeHash, registryType = 'contracts') {
      // this will error if the registry doesn't exist, this
      // is on purpose to ensure that typos don't create new
      // registries
      var registry = getNetworkRegistry(chainId, registryType);

      // save the registry into the map
      registry.contracts[alias] ||= {};
      registry.contracts[alias]['codeHash'] = codeHash;

      // save the registry
      commitNetworkRegistry(registry);
    }
  };
})();

require("@matterlabs/hardhat-zksync-deploy");
require("@matterlabs/hardhat-zksync-solc");
require("@matterlabs/hardhat-zksync-upgradable");
require("dotenv").config();
require('./tasks/genie.js');


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.16",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      }
    }
  }, 
  zksolc: {
    version: "latest",
    settings: {},
  },
  gasReporter: {
    enabled: (process.env.GAS_REPORT) ? true : false,
    currency: 'USD',
    coinmarketcap: `${process.env.CMC_API_KEY}`,
    token: 'ETH',
    gasPriceApi: 'https://api.etherscan.io/api?module=proxy&action=eth_gasPrice',
  },
  etherscan: {
    apiKey: {
      goerli: `${process.env.ETHERSCAN_API_KEY}`,
      polygonMumbai: `${process.env.POLYGONSCAN_API_KEY}`,
      base: `${process.env.BASE_API_KEY}`,
      scrollsepolia: `${process.env.SCROLL_API_KEY}`
    },
    customChains: [
     {
       network: "base",
       chainId: 8453,
       urls: {
        apiURL: "https://api.basescan.org/api",
        browserURL: "https://api.basescan.org"
       }
     },
     {
       network: 'scrollsepolia',
       chainId: 534351,
       urls: {
         apiURL: 'https://sepolia-blockscout.scroll.io/api',
         browserURL: 'https://sepolia-blockscout.scroll.io/',
       },
    },
   ]
  },
  networks: {
    goerli: {
      url: `${process.env.ALCHEMY_GOERLI_URL}`,
      accounts: [`${process.env.MY_PRIVATE_KEY}`],
      zksync: false
    },
    zkSyncTestnet: {
      url: "https://testnet.era.zksync.dev",
      ethNetwork: "goerli", // or a Goerli RPC endpoint from Infura/Alchemy/Chainstack etc.
      zksync: true,
    },
  }
};

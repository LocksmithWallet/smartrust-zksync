//////////////////////////////////////////////////////////////
// EtherVault.js
// 
// A simple implementation of a vault that providers collateral
// to the ledger. 
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
/// Imports
//////////////////////////////////////////////////////////////
const { expect } = require("chai");    // used for assertions
const {
  loadFixture                          // used for test setup
} = require("@nomicfoundation/hardhat-network-helpers");
require('./TrustTestUtils.js');        // custom helpers
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
describe("EtherVault", function () {
  ////////////////////////////////////////////////////////////
  // Deployment
  //
  // This test suite should fully validate the state
  // of the contract right after deployment.
  ////////////////////////////////////////////////////////////
  describe("Contract deployment", function () {
    it("Should not fail the deployment", async function () {
      const { owner, keyVault, locksmith,
        ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);

      expect(true);
    });

    it("Should have no eth balance", async function () {
      const { owner, keyVault, locksmith,
        ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);
      
      expect(await ethers.provider.getBalance(vault.address)).to.equal(0);
    });
  });
  
  ////////////////////////////////////////////////////////////
  // Upgrade
  // 
  // Tests a simple upgrade to ensure we have coverage
  // and upgradeability.
  ////////////////////////////////////////////////////////////
  describe("Contract upgrade", function() {
    it("Should be able to upgrade", async function() {
      const { owner, keyVault, locksmith,
        ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);

      const vaultV2 = await ethers.getContractFactory("EtherVault")
      const ethFundAgain = await upgrades.upgradeProxy(vault.address, vaultV2, [
        locksmith.address, 
        ledger.address
      ]);
      expect(true);
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Deposit Use Cases 
  //
  // This test suite should test our ability to create trusts
  // and deposit ether into multiple trusts and reconcile balances.
  ////////////////////////////////////////////////////////////
  describe("Basic Deposit Use Cases", function () {
    it("Happy case deposit sanity", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);

      // create a second trust with a different owner, set collateral provider
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));
      await notary.connect(second).setTrustedLedgerRole(1, 0, vault.ledger(), vault.address, true);

      // deposit some cash into the first trust
      var depositAmount = eth(10);
      await expect(await vault.connect(root).deposit(0, {value: depositAmount}))
        .to.emit(ledger, "depositOccurred")
        .withArgs(vault.address, 0, 0, ethArn(), depositAmount, depositAmount, depositAmount, depositAmount); 

      // deposit some cash into the second trust
      var anotherDeposit = eth(13); 
      await expect(await vault.connect(second).deposit(1, {value: anotherDeposit}))
        .to.emit(ledger, "depositOccurred")
        .withArgs(vault.address, 1, 1, ethArn(), anotherDeposit, anotherDeposit, anotherDeposit, eth(23)); 

      // post-condition asserts
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(23));
      expect(await ledger.connect(owner).getContextArnBalances(0,0,vault.address,[ethArn()]))
        .eql([eth(23)]);
      expect(await ledger.connect(owner).getContextArnBalances(1,0,vault.address,[ethArn()]))
        .eql([eth(10)]);
      expect(await ledger.connect(owner).getContextArnBalances(1,1,vault.address,[ethArn()]))
        .eql([eth(13)]);

      // make another deposit
      await expect(await vault.connect(root).deposit(0, {value: depositAmount}))
        .to.emit(ledger, "depositOccurred")
        .withArgs(vault.address, 0, 0, ethArn(), depositAmount, eth(20), eth(20), eth(33)); 
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(33));
    });

    it("Can't deposit without holding key", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);

      // try to deposit with a key not held
      await expect(vault.connect(second).deposit(1, {value: eth(10)}))
        .to.be.revertedWith("KEY_NOT_HELD");
    });

    it("Can't deposit if a beneficiary", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);

      //give the the other account a beneficiary key 
      await expect(await locksmith.connect(root).createKey(0, stb('beneficiary'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('beneficiary'), second.address);

      // try to deposit as a beneficiary, not good!
      await expect(vault.connect(second).deposit(1, {value: eth(10)}))
        .to.be.revertedWith("KEY_NOT_ROOT");
    })

    it("Can't deposit if not root", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.freshEtherVault);

      // give the other account a trustee key
      await expect(await locksmith.connect(root).createKey(0, stb('t'), second.address, false))
        .to.emit(locksmith, "keyMinted")
        .withArgs(root.address, 0, 1, stb('t'), second.address);

      // try to deposit as a trustee
      await expect(vault.connect(second).deposit(1, {value: eth(10)}))
        .to.be.revertedWith('KEY_NOT_ROOT');

      // validate the trust balances
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(0));
      expect(await ledger.getContextArnBalances(TRUST(),0,vault.address,[ethArn()]))
        .eql([eth(0)]);
    });
  });

  ////////////////////////////////////////////////////////////
  // Basic Withdrawal Use Cases
  //
  // Makes sure that a basic trust, when created, works for
  // withdrawals and ensure that all requirements are safely gaurded.
  ////////////////////////////////////////////////////////////
  describe("Basic Withdrawal Use Cases", function() {
    it("Owner withdrawal with and without approval", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.fundedEtherVault);
        
      // asset preconditions
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(40));
      
      // withdrawal some eth and ensure the right events are emitted
      await expect(vault.connect(root).withdrawal(0, eth(2)))
        .to.be.revertedWith('UNAPPROVED_AMOUNT');

      // approve the withdrawal with the ledger this time
      await notary.connect(root).setWithdrawalAllowance(vault.ledger(),
        vault.address, 0, ethArn(), eth(2));

      let rootBalance = await ethers.provider.getBalance(root.address);
      
      // withdrawal some eth and ensure the right events are emitted
      const tx = await doTransaction(vault.connect(root).withdrawal(0, eth(2))); 
      await expect(tx.transaction).to.emit(ledger, "withdrawalOccurred")
        .withArgs(vault.address, 0, 0, ethArn(), eth(2), eth(38), eth(38), eth(38)); 

      // check balances
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(38));
      expect(await ethers.provider.getBalance(root.address))
        .to.equal(rootBalance.sub(tx.gasCost).add(eth(2)));
    });

    it("Non-root withdrawal happy case", async function() {
      // TODO: Functionally this is the same thing
      // as root, but its good to cover. However, I need
      // a scribe to move the funds and I haven't gotten
      // that far yet.
      expect(true); 
    });

    it("Can't withdrawal more than balance", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.fundedEtherVault);

      // create a second trust wih a different owner
      await locksmith.connect(second).createTrustAndRootKey(stb("Second Trust"));

      // set the collateral provider with the notary
      await notary.connect(second).setTrustedLedgerRole(1, 0, vault.ledger(), vault.address, true);
      await notary.connect(second).setWithdrawalAllowance(
        vault.ledger(), vault.address, 1, ethArn(), eth(100));

      // put money into the second trust
      await expect(await vault.connect(second).deposit(1, {value: eth(20)}))
        .to.emit(ledger, "depositOccurred")
        .withArgs(vault.address, 1, 1, ethArn(), eth(20), eth(20), eth(20), eth(60)); 

      // asset preconditions for the entire trust contract
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(60));

      // withdrawal some eth and ensure the right events are emitted
      await expect(vault.connect(second).withdrawal(1, eth(61)))
        .to.be.revertedWith('OVERDRAFT');

      // check balance of vault isn't changed.
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(60));
    });

    it("Can't withdrawal without owning key used", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.fundedEtherVault);
        
      // asset preconditions
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(40));
      
      // approve the withdrawal with the ledger this time
      await notary.connect(root).setWithdrawalAllowance(vault.ledger(),
        vault.address, 0, ethArn(), eth(2));

      // withdrawal some eth and ensure the right events are emitted
      await expect(vault.connect(second).withdrawal(0, eth(3)))
        .to.be.revertedWith('KEY_NOT_HELD');

      // check balance of trust isn't changed.
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(40));
    });

    it("Can't withdrawal if key does not exist", async function() {
      const { owner, keyVault, locksmith,
        notary, ledger, vault,
        root, second, third
      } = await loadFixture(TrustTestFixtures.fundedEtherVault);
        
      // asset preconditions
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(40));
      
      // approve the withdrawal with the ledger this time
      await notary.connect(root).setWithdrawalAllowance(vault.ledger(),
        vault.address, 0, ethArn(), eth(200));

      // withdrawal some eth and ensure the right events are emitted
      await expect(vault.connect(owner).withdrawal(3, eth(3)))
        .to.be.revertedWith('KEY_NOT_HELD');

      // check balance of trust isn't changed.
      expect(await ethers.provider.getBalance(vault.address)).to.equal(eth(40));
    });
  });
});
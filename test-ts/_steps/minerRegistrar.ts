
import { accounts, indexMap } from "../_helpers/accounts";
import { MinerRegistrarInstance } from "../../contracts";

const config = require("../../republic-config");
import steps from "./steps";
import * as utils from "../_helpers/test_utils";
import { Transaction } from "web3";
import { BigNumber } from "bignumber.js";

// Wait for contracts:
// tslint:disable-next-line:no-any
let minerRegistrar: MinerRegistrarInstance, ren: any;
(async (): Promise<void> => {
  ren = await artifacts.require("RepublicToken").deployed();
  minerRegistrar = await artifacts.require("MinerRegistrar").deployed();
})();

module.exports = {

  WaitForEpoch: async (): Promise<void> => {
    while (true) {
      // Must be an on-chain call, or the time won't be updated
      const tx = await utils.logTx("Checking epoch", minerRegistrar.epoch());
      // If epoch happened, return
      if (tx.logs.length > 0 && tx.logs[tx.logs.length - 1].event === "NextEpoch") {
        return;
      }

      await utils.sleep(config.epochInterval * 0.1);
    }
  },

  GetEpochBlockhash: async (): Promise<string> => {
    return (await minerRegistrar.getCurrentEpoch.call()).blockhash;
  },

  GetCurrentMinerCount: async (): Promise<BigNumber> => {
    return await minerRegistrar.getNumberOfMiners.call();
  },

  GetRegisteredMiners: async (): Promise<Account[]> => {

    const count = await steps.GetCurrentMinerCount();
    const split = 50;
    const indexes = utils.range(Math.floor(count / split) + 1);
    const starts = indexes.map((index: number) => index * split);
    const ends = indexes.map((index: number) => Math.min((index + 1) * split, count));

    const miners = [];
    const l1: Account[] = await indexes
      .map((i: number) => minerRegistrar.getCurrentMiners(starts[i], ends[i]))
      .reduce(
      async (acc: Promise<Account[]>, curr: Promise<Account>) => {
        return (await acc).concat(await curr);
      },
      Array(0));
    // const l2 = await minerRegistrar.getCurrentMiners(0, count);

    // l1.should.deep.equal(l2);

    return l1;
  },

  GetRegisteredAccountIndexes: async (): Promise<number[]> => {
    const miners = await steps.GetRegisteredMiners();
    return miners.map((miner: string) => indexMap[miner]);
  },

  /** MINER SPECIFIC FUNCTIONS */

  /** Register */
  RegisterMiner: async (account: Account, bond: number): Promise<any> => {
    assert(bond > 0, "Registration bond must be positive");
    const difference = bond - (await minerRegistrar.getBondPendingWithdrawal(account.republic));
    if (difference) {
      await ren.approve(minerRegistrar.address, difference, { from: account.address });
    }
    // TODO: Generate signature
    const tx = await utils.logTx(
      "Registering",
      minerRegistrar.register(account.public, account.public, { from: account.address })
    );

    // Verify event
    // utils.assertEventsEqual(tx.logs[tx.logs.length - 1],
    //   { event: 'MinerRegistered', minerId: account.republic, bond: bond });
  },

  /** Deregister */
  DeregisterMiner: async (account: Account): Promise<any> => {
    const tx = await utils.logTx(
      "Deregistering",
      minerRegistrar.deregister(account.republic, { from: account.address })
    );
    // Verify event
    // const log = tx.logs[0];
    // assert(log.event == 'MinerDeregistered');
    // assert(log.args["minerId"] == account.republic);
  },

  /** GetBond */
  GetMinerBond: async (account: Account): Promise<any> => {
    return await minerRegistrar.getBond.call(account.republic);
  },

  /** Get miner ID from ethereum address */
  GetMinerID: async (account: Account): Promise<any> => {
    return await minerRegistrar.getMinerID.call(account.address);
  },

  GetMinerSeed: async (account: Account): Promise<any> => {
    return await minerRegistrar.getSeed.call(account.republic);
  },

  /** getMNetworkSize */
  GetAllMiners: async (): Promise<any> => {
    const [minerList, deregisteredCount, toDeregisterCount,
      stayingRegisteredCount, toRegisterCount] = await minerRegistrar.getAllMiners.call();
    const deregisteredOffset = 1;
    const toDeregisterOffset = deregisteredOffset + deregisteredCount.toNumber(); // 1 + 5 = 6
    const registeredOffset = toDeregisterOffset + toDeregisterCount.toNumber();
    const toRegisterOffset = registeredOffset + stayingRegisteredCount.toNumber();
    const end = toRegisterOffset + toRegisterCount.toNumber();
    console.log(`slice(${deregisteredOffset}, ${toDeregisterOffset}`);
    return {
      deregistered: minerList.slice(deregisteredOffset, toDeregisterOffset),
      toDeregister: minerList.slice(toDeregisterOffset, registeredOffset),
      registered: minerList.slice(registeredOffset, toRegisterOffset),
      toRegister: minerList.slice(toRegisterOffset, end),
    };
  },

  /** getMNetworkSize */
  GetMNetworkSize: async (): Promise<any> => {
    return await minerRegistrar.getMNetworkSize.call();
  },

  // GetMNetworkCount: async (): Promise<any> => {
  //   return await minerRegistrar.getMNetworkCount.call()
  // },

  /*** Expected Pool Count ***/
  // ExpectedMNetworkCount: (count) => {
  //   // TODO: Use contract getter instead
  //   return Math.ceil(Math.log2(count)) - 1
  // },

  /** GetRenBalance */
  GetRenBalance: async (account: Account): Promise<any> => {
    return await ren.balanceOf(account.address, { from: account.address });
  },

  // AssertPoolDistributions

  /** ApproveRenToMinerRegistrar */
  ApproveRenToMinerRegistrar: async (account: Account, amount: number): Promise<any> => {
    return await ren.approve(minerRegistrar.address, amount, { from: account.address });
  },

  /** UpdateBond */
  UpdateMinerBond: async (account: Account, newBond: number): Promise<any> => {
    const tx = await utils.logTx(
      "Updating bond",
      minerRegistrar.updateBond(account.republic, newBond, { from: account.address })
    );

    // Verify event
    // utils.assertEventsEqual(tx.logs[0],
    //   { event: 'MinerBondUpdated', minerId: account.republic, newBond: newBond });
  },

  WithdrawMinerBond: async (account: Account): Promise<any> => {
    return await utils.logTx(
      "Releasing bond",
      minerRegistrar.withdrawBond(account.republic, { from: account.address })
    );
  },

  /** GetPublicKey */
  GetMinerPublicKey: async (account: Account): Promise<any> => {
    return await minerRegistrar.getPublicKey(account.republic);
  },

  /** FUNCTIONS FOR ALL ACCOUNTS */

  WithdrawMinerBonds: async (_accounts: Account[]): Promise<any> => {
    for (let i = 0; i < _accounts.length; i++) {
      await steps.WithdrawMinerBond(_accounts[i]);
    }
    // await Promise.all(_accounts.map(
    //   account => steps.WithdrawMinerBond(account)
    // ));
  },

  /** Register all accounts */
  RegisterMiners: async (_accounts: Account[], bond: number): Promise<any> => {
    for (let i = 0; i < _accounts.length; i++) {
      await steps.RegisterMiner(_accounts[i], bond);
    }
    // await Promise.all(_accounts.map(
    //   account => steps.RegisterMiner(account, bond)
    // ));
  },

  /** Deregister all accounts */
  DeregisterMiners: async (_accounts: Account[]): Promise<any> => {
    for (let i = 0; i < _accounts.length; i++) {
      await steps.DeregisterMiner(_accounts[i]);
    }
    // await Promise.all(_accounts.map(
    //   account => steps.DeregisterMiner(account)
    // ));
  },

  /**
   * Sort the miners into MNetworks by keccak256(epoch blockhash + miner's precommited seed)
   */
  GetMNetworks: async (): Promise<MNetwork[]> => {
    const miners = await steps.GetRegisteredMiners();
    const epochHash = await steps.GetEpochBlockhash();

    // Get miner seeds
    const norms: any = {};
    // await Promise.all(miners.map(async (miner, i) => {
    //   const seed = await steps.GetMinerSeed({ republic: miner });
    //   norms[miner] = web3.sha3(seed + epochHash);
    // }));
    for (let i = 0; i < miners.length; i++) {
      const miner = miners[i];
      const seed = await steps.GetMinerSeed({ republic: miner });
      norms[miner] = web3.sha3(seed + epochHash);
    }

    // Sort miners by epoch blockhash and their norm
    miners.sort(
      (m_a: any, m_b: any) => norms[m_a] - norms[m_b]
    );

    const a = await steps.GetCurrentMinerCount(); // miners.length;
    const N = await minerRegistrar.getMNetworkSize();
    const p = Math.ceil(a / N);

    const mNetworks = [];
    for (let i = 0; i < p; i++) { mNetworks.push([]); }

    for (let i = 0; i < a; i++) {
      const mIndex = i % p;
      const account = accounts[indexMap[miners[i]]];
      mNetworks[mIndex].push(account);
    }

    return mNetworks;
  }

};
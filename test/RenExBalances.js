const RepublicToken = artifacts.require("RepublicToken");
const RenExSettlement = artifacts.require("RenExSettlement");
const RenExBalances = artifacts.require("RenExBalances");

const BigNumber = require("bignumber.js");
const chai = require("chai");
chai.use(require("chai-as-promised"));
chai.use(require("chai-bignumber")());
chai.should();

contract("TraderAccounts", function (accounts) {


    let renExBalances;
    let ETH, REN, TOKEN1, TOKEN2;

    beforeEach(async function () {
        ETH = { address: 0x0 };
        REN = await RepublicToken.new();
        TOKEN1 = await RepublicToken.new();
        TOKEN2 = await RepublicToken.new();

        renExBalances = await RenExBalances.new();
        renExSettlement = await RenExSettlement.new(0x0, renExBalances.address, 0x0);
        await renExBalances.setRenExSettlementContract(renExSettlement.address);
    });

    it("can hold tokens for a trader", async () => {
        const deposit1 = 100;
        const deposit2 = 50;

        // Get ERC20 balance for tokens
        const previous1 = await TOKEN1.balanceOf(accounts[0]);
        const previous2 = await TOKEN2.balanceOf(accounts[0]);

        // Approve and deposit
        await TOKEN1.approve(renExBalances.address, deposit1, { from: accounts[0] });
        await renExBalances.deposit(TOKEN1.address, deposit1, { from: accounts[0] });
        await TOKEN2.approve(renExBalances.address, deposit2, { from: accounts[0] });
        await renExBalances.deposit(TOKEN2.address, deposit2, { from: accounts[0] });

        // Check that balance in renExBalances is updated
        const [tokens, balances] = await renExBalances.getBalances.call(accounts[0]);
        tokens[0].should.equal(TOKEN1.address);
        tokens[1].should.equal(TOKEN2.address);
        balances[0].toNumber().should.equal(deposit1);
        balances[1].toNumber().should.equal(deposit2);

        // Check that the correct amount of tokens has been withdrawn
        (await TOKEN1.balanceOf(accounts[0])).should.be.bignumber.equal(previous1.sub(deposit1));
        (await TOKEN2.balanceOf(accounts[0])).should.be.bignumber.equal(previous2.sub(deposit2));

        // Withdraw
        await renExBalances.withdraw(TOKEN1.address, deposit1, { from: accounts[0] });
        await renExBalances.withdraw(TOKEN2.address, deposit2, { from: accounts[0] });

        // Check that the tokens have been returned
        (await TOKEN1.balanceOf(accounts[0])).should.be.bignumber.equal(previous1);
        (await TOKEN2.balanceOf(accounts[0])).should.be.bignumber.equal(previous2);
    })

    it("can hold tokens for multiple traders", async () => {
        const deposit1 = 100;
        const deposit2 = 50;

        // Give accounts[1] some tokens
        await TOKEN1.transfer(accounts[1], deposit2 * 2);

        // Get ERC20 balance for TOKEN1 and TOKEN2
        const previous1 = await TOKEN1.balanceOf(accounts[0]);
        const previous2 = await TOKEN1.balanceOf(accounts[1]);

        // Approve and deposit
        await TOKEN1.approve(renExBalances.address, deposit1, { from: accounts[0] });
        await renExBalances.deposit(TOKEN1.address, deposit1, { from: accounts[0] });
        await TOKEN1.approve(renExBalances.address, deposit2, { from: accounts[1] });
        await renExBalances.deposit(TOKEN1.address, deposit2, { from: accounts[1] });

        // Check that balance in renExBalances is updated
        const [tokens1, balances1] = await renExBalances.getBalances(accounts[0]);
        tokens1[0].should.equal(TOKEN1.address);
        balances1[0].toNumber().should.equal(deposit1);

        const [tokens2, balances2] = await renExBalances.getBalances(accounts[1]);
        tokens2[0].should.equal(TOKEN1.address);
        balances2[0].toNumber().should.equal(deposit2);

        // Check that the correct amount of tokens has been withdrawn
        (await TOKEN1.balanceOf(accounts[0])).should.be.bignumber.equal(previous1.sub(deposit1));
        (await TOKEN1.balanceOf(accounts[1])).should.be.bignumber.equal(previous2.sub(deposit2));

        // Withdraw
        await renExBalances.withdraw(TOKEN1.address, deposit1, { from: accounts[0] });
        await renExBalances.withdraw(TOKEN1.address, deposit2, { from: accounts[1] });

        // Check that the tokens have been returned
        (await TOKEN1.balanceOf(accounts[0])).should.be.bignumber.equal(previous1);
        (await TOKEN1.balanceOf(accounts[1])).should.be.bignumber.equal(previous2);
    })

    it("throws for invalid withdrawal", async () => {
        const deposit1 = 100;

        // Approve and deposit
        await TOKEN1.approve(renExBalances.address, deposit1, { from: accounts[0] });
        await renExBalances.deposit(TOKEN1.address, deposit1, { from: accounts[0] });

        // Withdraw more than deposited amount
        renExBalances.withdraw(TOKEN1.address, deposit1 * 2, { from: accounts[0] })
            .should.be.rejectedWith(Error);

        // Withdraw
        await renExBalances.withdraw(TOKEN1.address, deposit1, { from: accounts[0] });

        // Withdraw again
        renExBalances.withdraw(TOKEN1.address, deposit1, { from: accounts[0] })
            .should.be.rejectedWith(Error);
    })

    it("can deposit and withdraw multiple times", async () => {
        const deposit1 = 100;
        const deposit2 = 50;

        // Approve and deposit
        await TOKEN1.approve(renExBalances.address, deposit1 + deposit2, { from: accounts[0] });
        await renExBalances.deposit(TOKEN1.address, deposit1, { from: accounts[0] });
        await renExBalances.deposit(TOKEN1.address, deposit2, { from: accounts[0] });

        // Withdraw
        await renExBalances.withdraw(TOKEN1.address, deposit1, { from: accounts[0] });
        await renExBalances.withdraw(TOKEN1.address, deposit2, { from: accounts[0] });
    })

    it("can hold ether for a trader", async () => {
        const deposit1 = 1;

        const previous = await web3.eth.getBalance(accounts[0]);

        // Approve and deposit
        const fee1 = await getFee(renExBalances.deposit(ETH.address, deposit1, { from: accounts[0], value: deposit1 }));

        // Balance should be (previous - fee1 - deposit1)
        const after = (await web3.eth.getBalance(accounts[0]));
        after.should.be.bignumber.equal(previous.sub(fee1).sub(deposit1));

        // Withdraw
        const fee2 = await getFee(renExBalances.withdraw(ETH.address, deposit1, { from: accounts[0] }));

        // Balance should be (previous - fee1 - fee2)
        (await web3.eth.getBalance(accounts[0])).should.be.bignumber.equal(previous.sub(fee1).sub(fee2));
    })
});


async function getFee(txP) {
    const tx = await txP;
    const gasAmount = tx.receipt.gasUsed;
    const gasPrice = await web3.eth.getTransaction(tx.tx).gasPrice;
    return gasPrice.mul(gasAmount);
}
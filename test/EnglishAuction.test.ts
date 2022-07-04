import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import { EnglishAuction__factory } from "../typechain-types/factories/contracts/EnglishAuction__factory";
import { EnglishAuction } from "../typechain-types/contracts/EnglishAuction";
import { NFTMock__factory } from "../typechain-types/factories/contracts/test/NFTMock__factory";
import { NFTMock } from "../typechain-types/contracts/test/NFTMock";
import { OrangeTokenMock__factory } from "../typechain-types/factories/contracts/test/OrangeTokenMock__factory";
import { OrangeTokenMock } from "../typechain-types/contracts/test/OrangeTokenMock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

async function incrementNextBlockTimestamp(amount: number): Promise<void> {
  return ethers.provider.send("evm_increaseTime", [amount]);
}

async function getBlockTimestamp(tx: any): Promise<number> {
  const minedTx = await tx.wait();
  const txBlock = await ethers.provider.getBlock(minedTx.blockNumber);
  return txBlock.timestamp;
}

describe('English auction contract', () => {
  let auction: EnglishAuction;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let nft: NFTMock;
  let erc20Token: OrangeTokenMock;
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const decimals = 18;

  beforeEach(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const Auction = (await ethers.getContractFactory('EnglishAuction')) as EnglishAuction__factory;
    auction = await Auction.deploy();

    await auction.deployed();

    const Nft = (await ethers.getContractFactory('NFTMock')) as NFTMock__factory;
    nft = await Nft.deploy();

    await nft.deployed();

    const Erc20Token = (await ethers.getContractFactory('OrangeTokenMock')) as OrangeTokenMock__factory;
    erc20Token = await Erc20Token.deploy();

    await erc20Token.deployed();
  });

  describe('transfers', () => {
    let tokenId: BigNumber;

    beforeEach(async () => {
      tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
    });

    it('transfers successfully', async () => {
      const result = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      const auctionInfo = await auction.auctionInfo(nft.address, tokenId);

      expect(auctionInfo.seller).to.equal(owner.address);
      expect(auctionInfo.ownerNft).to.equal(owner.address);

      await expect(result).to.emit(auction, "ERC721Received")
        .withArgs(tokenId, nft.address, owner.address);
    })

    it('rejects transfering when nft is not received', async () => {
      await expect(auction.onERC721Received(addr2.address, addr1.address, tokenId, "0x")).to.be.reverted;
    })
  })

  describe('listes on auction', () => {
    let tokenId: BigNumber;
    let result: any;
    let txTimestamp: any;
    let minBid: BigNumber;

    beforeEach(async () => {
      tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      result = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      txTimestamp = await getBlockTimestamp(result);

      minBid = parseUnits("1", decimals);
    });

    it('listes on auction successfully', async () => {
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      const result = await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      const auctionInfo = await auction.auctionInfo(nft.address, tokenId);

      expect(auctionInfo.erc20Token).to.equal(erc20Token.address);
      expect(auctionInfo.minBid).to.equal(minBid);
      expect(auctionInfo.startAt).to.equal(startAt);
      expect(auctionInfo.endAt).to.equal(endAt);
      expect(auctionInfo.status).to.equal(1);

      await expect(result).to.emit(auction, "ListOnAuction")
        .withArgs(tokenId, nft.address, owner.address, erc20Token.address, minBid, startAt, endAt);
    })

    it('re-listes after the end of the auction', async () => {
      let startAt = txTimestamp + 86400;
      let endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      await incrementNextBlockTimestamp(90001);
      await ethers.provider.send("evm_mine", []);

      await auction.finishAuction(tokenId, nft.address);

      startAt += 86400;
      endAt += 90000;

      const result = await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      const auctionInfo = await auction.auctionInfo(nft.address, tokenId);

      expect(auctionInfo.erc20Token).to.equal(erc20Token.address);
      expect(auctionInfo.minBid).to.equal(minBid);
      expect(auctionInfo.startAt).to.equal(startAt);
      expect(auctionInfo.endAt).to.equal(endAt);
      expect(auctionInfo.status).to.equal(1);

      await expect(result).to.emit(auction, "ListOnAuction")
        .withArgs(tokenId, nft.address, owner.address, erc20Token.address, minBid, startAt, endAt);
    })

    it('rejects listing when nft contract is zero address', async () => {
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await expect(auction.listOnAuction(tokenId, zeroAddress, erc20Token.address, minBid, startAt, endAt)).to.be.revertedWith("Auction: NFT is zero address!");
    })

    it('rejects listing when an auction has a NFT', async () => {
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      await expect(auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt)).to.be.revertedWith("Auction: NFT listed!");
    })

    it('rejects listing when this is not the owner of nft', async () => {
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await expect(auction.connect(addr1).listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt)).to.be.revertedWith("Auction: not owner NFT!");
    })

    it('rejects listing when start time less than current', async () => {
      const startAt = txTimestamp - 90000;
      const endAt = txTimestamp + 90000;

      await expect(auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt)).to.be.revertedWith("Auction: start at less than now!");
    })

    it('rejects listing when end time less than start', async () => {
      const startAt = txTimestamp + 90000;
      const endAt = txTimestamp + 86400;

      await expect(auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt)).to.be.revertedWith("Auction: end at less than start at!");
    })
  })

  describe('places a bid', () => {
    let tokenId: BigNumber;
    let txResult: any;
    let txTimestamp: any;
    let minBid: BigNumber;
    let startAt: any;
    let endAt: any;

    beforeEach(async () => {
      tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      txResult = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      txTimestamp = await getBlockTimestamp(txResult);

      minBid = parseUnits("1", decimals);
      startAt = txTimestamp + 86400;
      endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);
    });

    it('places the first bid on an action successfully', async () => {
      const bid = parseUnits("2", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await erc20Token.mint(addr1.address, bid);
      await erc20Token.connect(addr1).approve(auction.address, bid);

      const addr1BalanceBefore = await erc20Token.balanceOf(addr1.address);
      const auctionBalanceBefore = await erc20Token.balanceOf(auction.address);

      const result = await auction.connect(addr1).placeBid(tokenId, nft.address, bid);

      const addr1BalanceAfter = await erc20Token.balanceOf(addr1.address);
      const auctionBalanceAfter = await erc20Token.balanceOf(auction.address);

      const auctionInfo = await auction.auctionInfo(nft.address, tokenId);

      expect(auctionInfo.bidderWallet).to.equal(addr1.address);
      expect(auctionInfo.maxBid).to.equal(bid);
      expect(addr1BalanceAfter).to.equal(addr1BalanceBefore.sub(bid));
      expect(auctionBalanceAfter).to.equal(auctionBalanceBefore.add(bid));

      await expect(result).to.emit(auction, 'Bid')
        .withArgs(tokenId, nft.address, addr1.address, bid);
    })

    it('places a bid and return previous successfully', async () => {
      const addr1Bid = parseUnits("2", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await erc20Token.mint(addr1.address, addr1Bid);
      await erc20Token.connect(addr1).approve(auction.address, addr1Bid);

      await auction.connect(addr1).placeBid(tokenId, nft.address, addr1Bid);

      const addr2Bid = parseUnits("3", decimals);

      await erc20Token.mint(addr2.address, addr2Bid);
      await erc20Token.connect(addr2).approve(auction.address, addr2Bid);

      const addr1BalanceBefore = await erc20Token.balanceOf(addr1.address);
      const addr2BalanceBefore = await erc20Token.balanceOf(addr2.address);

      const result = await auction.connect(addr2).placeBid(tokenId, nft.address, addr2Bid);

      const addr1BalanceAfter = await erc20Token.balanceOf(addr1.address);
      const addr2BalanceAfter = await erc20Token.balanceOf(addr2.address);
      const auctionBalanceAfter = await erc20Token.balanceOf(auction.address);

      const auctionInfo = await auction.auctionInfo(nft.address, tokenId);

      expect(auctionInfo.bidderWallet).to.equal(addr2.address);
      expect(auctionInfo.maxBid).to.equal(addr2Bid);
      expect(addr1BalanceAfter).to.equal(addr1BalanceBefore.add(addr1Bid));
      expect(addr2BalanceAfter).to.equal(addr2BalanceBefore.sub(addr2Bid));
      expect(auctionBalanceAfter).to.equal(addr2Bid);

      await expect(result).to.emit(auction, 'Bid')
        .withArgs(tokenId, nft.address, addr2.address, addr2Bid);
    })

    it('rejects placing a bid when an auction creator', async () => {
      const bid = parseUnits("2", decimals);

      await expect(auction.placeBid(tokenId, nft.address, bid)).to.be.revertedWith("Auction: forbidden for owner!");
    })

    it('rejects placing a bid when a auction is not active', async () => {
      const bid = parseUnits("2", decimals);

      await expect(auction.connect(addr1).placeBid(tokenId, nft.address, bid)).to.be.revertedWith("Auction: not active!");
    })

    it('rejects placing a bid when it is less than minimum', async () => {
      const bid = parseUnits("1", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await expect(auction.connect(addr1).placeBid(tokenId, nft.address, bid)).to.be.revertedWith("Auction: bid less than minimum!");
    })

    it('rejects placing a bid when it is less than maximum', async () => {
      const bid = parseUnits("2", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await erc20Token.mint(addr1.address, bid);
      await erc20Token.connect(addr1).approve(auction.address, bid);

      await auction.connect(addr1).placeBid(tokenId, nft.address, bid);

      await erc20Token.mint(addr2.address, bid);
      await erc20Token.connect(addr2).approve(auction.address, bid);

      await expect(auction.connect(addr2).placeBid(tokenId, nft.address, bid)).to.be.revertedWith("Auction: bid less than maximum!");
    })
  })

  describe('finishes an auction', () => {
    it('finishes an auction without bids successfully', async () => {
      const tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      const txResult = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      const txTimestamp = await getBlockTimestamp(txResult);

      const minBid = parseUnits("1", decimals);
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      await incrementNextBlockTimestamp(90001);
      await ethers.provider.send("evm_mine", []);

      const auctionInfoBefore = await auction.auctionInfo(nft.address, tokenId);

      const sellerBalanceBefore = await erc20Token.balanceOf(auctionInfoBefore.seller);

      const result = await auction.finishAuction(tokenId, nft.address);

      const auctionInfoAfter = await auction.auctionInfo(nft.address, tokenId);

      const sellerBalanceAfter = await erc20Token.balanceOf(auctionInfoAfter.seller);

      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore);

      expect(auctionInfoAfter.status).to.equal(0);
      expect(auctionInfoAfter.bidderWallet).to.equal(zeroAddress);
      expect(auctionInfoAfter.maxBid).to.equal(0);
      expect(auctionInfoAfter.ownerNft).to.equal(auctionInfoBefore.ownerNft);

      await expect(result).to.emit(auction, 'Finish')
        .withArgs(tokenId, nft.address, auctionInfoAfter.seller, auctionInfoAfter.ownerNft);
    })

    it('finishes an auction with bids successfully', async () => {
      const tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      const txResult = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      const txTimestamp = await getBlockTimestamp(txResult);

      const minBid = parseUnits("1", decimals);
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      const bid = parseUnits("2", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await erc20Token.mint(addr1.address, bid);
      await erc20Token.connect(addr1).approve(auction.address, bid);

      await auction.connect(addr1).placeBid(tokenId, nft.address, bid);

      const auctionInfoBefore = await auction.auctionInfo(nft.address, tokenId);

      const auctionBalanceBefore = await erc20Token.balanceOf(auction.address);
      const sellerBalanceBefore = await erc20Token.balanceOf(auctionInfoBefore.seller);

      await incrementNextBlockTimestamp(3600);
      await ethers.provider.send("evm_mine", []);

      const result = await auction.finishAuction(tokenId, nft.address);

      const auctionInfoAfter = await auction.auctionInfo(nft.address, tokenId);

      const auctionBalanceAfter = await erc20Token.balanceOf(auction.address);
      const sellerBalanceAfter = await erc20Token.balanceOf(auctionInfoAfter.seller);

      expect(auctionBalanceAfter).to.equal(auctionBalanceBefore.sub(bid));
      expect(sellerBalanceAfter).to.equal(sellerBalanceBefore.add(bid));

      expect(auctionInfoAfter.status).to.equal(0);
      expect(auctionInfoAfter.bidderWallet).to.equal(zeroAddress);
      expect(auctionInfoAfter.maxBid).to.equal(0);
      expect(auctionInfoAfter.ownerNft).to.equal(auctionInfoBefore.bidderWallet);

      await expect(result).to.emit(auction, 'Finish')
        .withArgs(tokenId, nft.address, auctionInfoAfter.seller, auctionInfoAfter.ownerNft);
    })

    it('rejects finishing an auctin when time is not end', async () => {
      const tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      await expect(auction.finishAuction(tokenId, nft.address)).to.be.revertedWith("Auction: cannot finish now!");
    })
  })
  describe('withdraws a nft', () => {
    it('finishes an auction with bids successfully', async () => {
      const tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      const txResult = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      const txTimestamp = await getBlockTimestamp(txResult);

      const minBid = parseUnits("1", decimals);
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      const bid = parseUnits("2", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await erc20Token.mint(addr1.address, bid);
      await erc20Token.connect(addr1).approve(auction.address, bid);

      await auction.connect(addr1).placeBid(tokenId, nft.address, bid);

      await incrementNextBlockTimestamp(3600);
      await ethers.provider.send("evm_mine", []);

      await auction.finishAuction(tokenId, nft.address);

      expect(false).to.equal(await nft.ownerOf(tokenId) == addr1.address);
      expect(true).to.equal(await nft.ownerOf(tokenId) == auction.address);

      const result = await auction.connect(addr1).withdrawNft(tokenId, nft.address);

      const auctionInfoAfter = await auction.auctionInfo(nft.address, tokenId);

      expect(auctionInfoAfter.seller).to.equal(zeroAddress);
      expect(auctionInfoAfter.ownerNft).to.equal(zeroAddress);
      expect(auctionInfoAfter.erc20Token).to.equal(zeroAddress);
      expect(auctionInfoAfter.minBid).to.equal(0);
      expect(auctionInfoAfter.maxBid).to.equal(0);
      expect(auctionInfoAfter.bidderWallet).to.equal(zeroAddress);
      expect(auctionInfoAfter.maxBid).to.equal(0);
      expect(auctionInfoAfter.startAt).to.equal(0);
      expect(auctionInfoAfter.endAt).to.equal(0);
      expect(auctionInfoAfter.status).to.equal(0);

      expect(true).to.equal(await nft.ownerOf(tokenId) == addr1.address);
      expect(false).to.equal(await nft.ownerOf(tokenId) == auction.address);

      await expect(result).to.emit(auction, 'Withdraw')
        .withArgs(tokenId, nft.address, addr1.address);
    })

    it('rejects withdrawing a nft when an auction is not exist', async () => {
      const tokenId = await nft.tokenCounter();
      await expect(auction.withdrawNft(tokenId, nft.address)).to.be.revertedWith("Auction: not exist!");
    })

    it('rejects withdrawing a nft when an auction has not finished', async () => {
      const tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      const txResult = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      const txTimestamp = await getBlockTimestamp(txResult);

      const minBid = parseUnits("1", decimals);
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      await expect(auction.withdrawNft(tokenId, nft.address)).to.be.revertedWith("Auction: not finished!");
    })

    it('rejects withdrawing a nft when it is not owner', async () => {
      const tokenId = await nft.tokenCounter();
      await nft.mint('ipfs://QmPShXrfttmnNtE9V6QmcrR8F29V7HMuMrsRyQyUXs35id');
      const txResult = await nft["safeTransferFrom(address,address,uint256)"](owner.address, auction.address, tokenId);

      const txTimestamp = await getBlockTimestamp(txResult);

      const minBid = parseUnits("1", decimals);
      const startAt = txTimestamp + 86400;
      const endAt = txTimestamp + 90000;

      await auction.listOnAuction(tokenId, nft.address, erc20Token.address, minBid, startAt, endAt);

      const bid = parseUnits("2", decimals);

      await incrementNextBlockTimestamp(86401);
      await ethers.provider.send("evm_mine", []);

      await erc20Token.mint(addr1.address, bid);
      await erc20Token.connect(addr1).approve(auction.address, bid);

      await auction.connect(addr1).placeBid(tokenId, nft.address, bid);

      await incrementNextBlockTimestamp(3600);
      await ethers.provider.send("evm_mine", []);

      await auction.finishAuction(tokenId, nft.address);

      await expect(auction.withdrawNft(tokenId, nft.address)).to.be.revertedWith("Auction: not owner NFT!");
    })
  })
});

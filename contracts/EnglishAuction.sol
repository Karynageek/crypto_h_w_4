//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "hardhat/console.sol";

contract EnglishAuction is IERC721Receiver {
    uint256 private counter;

    mapping(address => mapping(uint256 => Auction)) public auctionInfo;

    enum Status {
        NOT_ACTIVE,
        ACTIVE,
        FINISHED,
        WITHDRAWN
    }

    struct Auction {
        uint256 nftId;
        address seller;
        uint256 minBid;
        uint256 maxBid;
        address maxBidder;
        uint256 lockTime;
        uint256 unlockTime;
        uint256 status;
    }

    event ListOnAuction(
        uint256 indexed auctionId,
        uint256 nftId,
        address indexed nftContract,
        address seller,
        uint256 minBid,
        uint256 lockTime,
        uint256 unlockTime
    );

    event Bid(
        uint256 indexed auctionId,
        address indexed nftContract,
        address bidder,
        uint256 bid
    );

    event Withdraw(
        uint256 indexed auctionId,
        address indexed nftContract,
        address winner
    );

    constructor() {
        counter = 0;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) public override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function listOnAuction(
        uint256 _nftId,
        address _nftContract,
        uint256 _minBid,
        uint256 _lockTime,
        uint256 _unlockTime
    ) public returns (Auction memory) {
        require(
            _nftContract != address(0),
            "Nft contract is not zero address!"
        );

        require(
            _lockTime > block.timestamp,
            "Lock time cannot be less than current!"
        );

        require(
            _lockTime < _unlockTime,
            "Lock time cannot be less than unlock!"
        );

        ERC721(_nftContract).safeTransferFrom(
            msg.sender,
            address(this),
            _nftId
        );

        Auction memory newAuction = Auction(
            _nftId,
            msg.sender,
            _minBid,
            0,
            address(0),
            _lockTime,
            _unlockTime,
            uint256(Status.NOT_ACTIVE)
        );

        auctionInfo[_nftContract][counter] = newAuction;

        emit ListOnAuction(
            counter,
            _nftId,
            _nftContract,
            msg.sender,
            _minBid,
            _lockTime,
            _unlockTime
        );

        counter++;

        return newAuction;
    }

    function placeBid(
        address _nftContract,
        uint256 _auctionId,
        uint256 _bid
    ) external returns (bool) {
        require(
            msg.sender != _nftContract,
            "The auction creator cannot place a bid!"
        );

        Auction memory auction = auctionInfo[_nftContract][_auctionId];

        if (
            auction.status != uint256(Status.ACTIVE) &&
            auction.lockTime < block.timestamp &&
            auction.unlockTime > block.timestamp
        ) {
            auction.status = uint256(Status.ACTIVE);
        }

        require(
            auction.status == uint256(Status.ACTIVE),
            "The Auction is not active!"
        );

        require(auction.minBid >= _bid, "The Bid less than minimum!");
        require(auction.maxBid > _bid, "The Bid less than maximum!");

        payable(auction.maxBidder).transfer(auction.maxBid);

        auction.maxBid = _bid;
        auction.maxBidder = msg.sender;

        emit Bid(_auctionId, _nftContract, msg.sender, _bid);

        return true;
    }

    function finishAuction(address _nftContract, uint256 _auctionId) public {
        Auction storage auction = auctionInfo[_nftContract][_auctionId];

        require(
            auction.unlockTime < block.timestamp,
            "Unlock time hasn't finished yet!"
        );

        auction.status = uint256(Status.FINISHED);

        if (auction.maxBid > 0) {
            payable(auction.seller).transfer(auction.maxBid);
        } else {
            ERC721(_nftContract).safeTransferFrom(
                address(this),
                auction.seller,
                auction.nftId
            );
        }
    }

    function withdrawNft(address _nftContract, uint256 _auctionId) public {
        Auction memory auction = auctionInfo[_nftContract][_auctionId];

        require(
            auction.status == uint256(Status.FINISHED),
            "The Auction hasn't finished yet!"
        );

        require(
            auction.maxBidder == msg.sender,
            "Only winner can withdraw NFT!"
        );

        ERC721(_nftContract).safeTransferFrom(
            address(this),
            msg.sender,
            auction.nftId
        );

        emit Withdraw(_auctionId, _nftContract, msg.sender);
    }
}

// onERC721Received - ERC721TokenReceiver interface function. Hook that will be triggered on safeTransferFrom as per EIP-721. It should execute a deposit for `_from` address. After deposit this token can be either returned back to the owner, or placed on auction. It should emit an event that will let the user know that the deposit is successful. It is mandatory to call ERC721 back to check if a token is received by auction.

// listOnAuction - list on auction NFT that msg.sender has deposited with safeTransferFrom. Users willing to list their NFT are free to choose any ERC20 token for bids. Also, they have to input the auction start UTC timestamp, auction end UTC timestamp and minimum bid amount. During the auction there should be no way for NFT to leave the contract - it should be locked on contract. Unique auctionId should be issued for further user bids and emitted in an event

// placeBid - should withdraw ERC20 tokens specified in listOnAuction function for specific auction id. One NFT can participate in only one auction. Function should revert if bid is placed out of auction effective time range specified in listOnAuction. Bid cannot be reverted, only when bidder loses.

// finishAuction - can be called by anyone on blockchain after auction end UTC timestamp is reached. Function should summarize auction results, transfer winning amount of ERC20 tokens to the auction issuer and unlock NFT for withdrawal or placing on auction again only for the auction winner. Note, that if the auction is finished without any single bid, it should not make any ERC20 token transfer and let the auction issuer withdraw the token or start auction again.

// withdrawNft - transfers NFT to its owner. Owner of NFT is an address who has deposited an NFT and never placed it on auction, or deposited an NFT and placed on auction that didn’t receive any at least minimum bid, or auction winner that didn’t place his earned NFT on auction. During the auction NFT can’t be withdrawn.

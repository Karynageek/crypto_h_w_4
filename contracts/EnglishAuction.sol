//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// import "hardhat/console.sol";

contract EnglishAuction is IERC721Receiver {
    mapping(address => mapping(uint256 => Auction)) public auctionInfo;

    mapping(address => mapping(uint256 => NftHolder)) public nftHolders;

    enum Status {
        NOT_ACTIVE,
        ACTIVE,
        FINISHED
    }

    struct NftHolder {
        address owner;
        bool addedToAuction;
    }

    struct Auction {
        address seller;
        address erc20Token;
        uint256 minBid;
        uint256 maxBid;
        address bidderWallet;
        uint256 startAt;
        uint256 endAt;
        uint256 status;
    }

    event ListOnAuction(
        uint256 indexed nftId,
        address indexed nftContract,
        address seller,
        address erc20Token,
        uint256 minBid,
        uint256 startAt,
        uint256 endAt
    );

    event Bid(
        uint256 indexed nftId,
        address indexed nftContract,
        address bidder,
        uint256 bid
    );

    event Withdraw(
        address to,
        address indexed nftContract,
        uint256 indexed nftId
    );

    event TransferNFTFallBack(
        address from,
        address indexed nftContract,
        uint256 indexed nftId
    );

    function onERC721Received(
        address _operator,
        address _from,
        uint256 _tokenId,
        bytes calldata data
    ) public virtual override returns (bytes4) {
        NftHolder memory holder = nftHolders[msg.sender][_tokenId];

        require(
            holder.addedToAuction == false,
            "The auction already has a nft."
        );

        holder.owner = _from;
        holder.addedToAuction = false;

        emit TransferNFTFallBack(_from, msg.sender, _tokenId);

        return this.onERC721Received.selector;
    }

    function listOnAuction(
        uint256 _nftId,
        address _nftContract,
        address _erc20Token,
        uint256 _minBid,
        uint256 _startAt,
        uint256 _endAt
    ) public returns (Auction memory) {
        require(
            _nftContract != address(0),
            "Nft contract is not zero address!"
        );

        NftHolder memory holder = nftHolders[_nftContract][_nftId];

        require(
            holder.addedToAuction == true,
            "The auction already has a NFT!"
        );

        require(
            holder.owner != address(0),
            "NFT didn't transfer on the auction contract!"
        );

        require(
            holder.owner == msg.sender,
            "Only owner NFT can list on Auction!"
        );

        require(
            _startAt > block.timestamp,
            "Lock time cannot be less than current!"
        );

        require(_startAt < _endAt, "Lock time cannot be less than unlock!");

        holder.addedToAuction = true;

        Auction memory newAuction = Auction(
            msg.sender,
            _erc20Token,
            _minBid,
            0,
            address(0),
            _startAt,
            _endAt,
            uint256(Status.NOT_ACTIVE)
        );

        auctionInfo[_nftContract][_nftId] = newAuction;

        emit ListOnAuction(
            _nftId,
            _nftContract,
            msg.sender,
            _erc20Token,
            _minBid,
            _startAt,
            _endAt
        );

        return newAuction;
    }

    function placeBid(
        address _nftContract,
        uint256 _nftId,
        uint256 _bid
    ) external returns (bool) {
        Auction memory auction = auctionInfo[_nftContract][_nftId];

        require(
            msg.sender != auction.seller,
            "The auction creator cannot place a bid!"
        );

        if (
            auction.status == uint256(Status.NOT_ACTIVE) &&
            auction.startAt < block.timestamp &&
            auction.endAt > block.timestamp
        ) {
            auction.status = uint256(Status.ACTIVE);
        }

        require(
            auction.status == uint256(Status.ACTIVE),
            "The Auction is not active!"
        );

        require(auction.minBid >= _bid, "The Bid less than minimum!");
        require(auction.maxBid > _bid, "The Bid less than maximum!");

        if (auction.bidderWallet != address(0)) {
            IERC20(auction.erc20Token).transfer(
                auction.bidderWallet,
                auction.maxBid
            );
        }

        IERC20(auction.erc20Token).transferFrom(
            msg.sender,
            address(this),
            _bid
        );

        auction.bidderWallet = msg.sender;
        auction.maxBid = _bid;

        NftHolder memory holder = nftHolders[_nftContract][_nftId];
        holder.owner = msg.sender;

        emit Bid(_nftId, _nftContract, msg.sender, _bid);

        return true;
    }

    function finishAuction(address _nftContract, uint256 _nftId) public {
        Auction memory auction = auctionInfo[_nftContract][_nftId];

        require(
            auction.endAt < block.timestamp &&
                auction.status == uint256(Status.ACTIVE),
            "The Auction hasn't finished yet!"
        );

        auction.status = uint256(Status.FINISHED);
        auction.bidderWallet = address(0);
        auction.maxBid = 0;

        NftHolder memory holder = nftHolders[_nftContract][_nftId];

        holder.addedToAuction = false;

        if (auction.maxBid > 0) {
            IERC721(_nftContract).safeTransferFrom(
                address(this),
                msg.sender,
                _nftId
            );

            IERC20(auction.erc20Token).transfer(auction.seller, auction.maxBid);
        } else {
            IERC721(_nftContract).safeTransferFrom(
                address(this),
                auction.seller,
                _nftId
            );
        }
    }

    function withdrawNft(address _nftContract, uint256 _nftId) public {
        NftHolder memory holder = nftHolders[_nftContract][_nftId];
        Auction memory auction = auctionInfo[_nftContract][_nftId];

        require(
            holder.addedToAuction == false &&
                auction.status == uint256(Status.FINISHED),
            "The Auction hasn't finished yet!"
        );

        require(holder.owner == msg.sender, "Only owner NFT can withdraw!");

        delete auctionInfo[_nftContract][_nftId];
        delete nftHolders[_nftContract][_nftId];

        IERC721(_nftContract).safeTransferFrom(
            address(this),
            msg.sender,
            _nftId
        );

        emit Withdraw(msg.sender, _nftContract, _nftId);
    }
}

// onERC721Received - ERC721TokenReceiver interface function. Hook that will be triggered on safeTransferFrom as per EIP-721. It should execute a deposit for `_from` address. After deposit this token can be either returned back to the owner, or placed on auction. It should emit an event that will let the user know that the deposit is successful. It is mandatory to call ERC721 back to check if a token is received by auction.

// listOnAuction - list on auction NFT that msg.sender has deposited with safeTransferFrom. Users willing to list their NFT are free to choose any ERC20 token for bids. Also, they have to input the auction start UTC timestamp, auction end UTC timestamp and minimum bid amount. During the auction there should be no way for NFT to leave the contract - it should be locked on contract. Unique auctionId should be issued for further user bids and emitted in an event

// placeBid - should withdraw ERC20 tokens specified in listOnAuction function for specific auction id. One NFT can participate in only one auction. Function should revert if bid is placed out of auction effective time range specified in listOnAuction. Bid cannot be reverted, only when bidder loses.

// finishAuction - can be called by anyone on blockchain after auction end UTC timestamp is reached. Function should summarize auction results, transfer winning amount of ERC20 tokens to the auction issuer and unlock NFT for withdrawal or placing on auction again only for the auction winner. Note, that if the auction is finished without any single bid, it should not make any ERC20 token transfer and let the auction issuer withdraw the token or start auction again.

// withdrawNft - transfers NFT to its owner. Owner of NFT is an address who has deposited an NFT and never placed it on auction, or deposited an NFT and placed on auction that didn’t receive any at least minimum bid, or auction winner that didn’t place his earned NFT on auction. During the auction NFT can’t be withdrawn.

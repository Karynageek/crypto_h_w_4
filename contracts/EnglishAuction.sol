//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract EnglishAuction is IERC721Receiver {
    mapping(address => mapping(uint256 => Auction)) public auctionInfo;

    enum Status {
        NOT_ACTIVE,
        WAIT,
        ACTIVE,
        FINISHED
    }

    struct Auction {
        address seller;
        address ownerNft;
        address erc20Token;
        uint256 minBid;
        uint256 maxBid;
        address bidderWallet;
        uint256 startAt;
        uint256 endAt;
        uint256 status;
    }

    event ERC721Received(
        uint256 indexed nftId,
        address indexed nftContract,
        address from
    );

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

    event Finish(
        uint256 indexed nftId,
        address indexed nftContract,
        address seller,
        address nftOwner
    );

    event Withdraw(
        uint256 indexed nftId,
        address indexed nftContract,
        address to
    );

    function onERC721Received(
        address,
        address _from,
        uint256 _tokenId,
        bytes calldata
    ) external virtual override returns (bytes4) {
        Auction storage auction = auctionInfo[msg.sender][_tokenId];

        require(
            address(this) == IERC721(msg.sender).ownerOf(_tokenId),
            "Auction: NFT not received!"
        );

        auction.seller = _from;
        auction.ownerNft = _from;

        emit ERC721Received(_tokenId, msg.sender, _from);

        return this.onERC721Received.selector;
    }

    function listOnAuction(
        uint256 _nftId,
        address _nftContract,
        address _erc20Token,
        uint256 _minBid,
        uint256 _startAt,
        uint256 _endAt
    ) external returns (Auction memory) {
        require(_nftContract != address(0), "Auction: NFT is zero address!");

        Auction storage auction = auctionInfo[_nftContract][_nftId];

        require(
            auction.status != uint256(Status.FINISHED),
            "Auction: not finished!"
        );

        require(
            auction.status == uint256(Status.NOT_ACTIVE),
            "Auction: NFT listed!"
        );

        require(auction.seller == msg.sender, "Auction: not owner NFT!");

        require(_startAt > block.timestamp, "Auction: start at less than now!");

        require(_startAt < _endAt, "Auction: end at less than start at!");

        auction.erc20Token = _erc20Token;
        auction.minBid = _minBid;
        auction.startAt = _startAt;
        auction.endAt = _endAt;
        auction.status = uint256(Status.WAIT);

        emit ListOnAuction(
            _nftId,
            _nftContract,
            msg.sender,
            _erc20Token,
            _minBid,
            _startAt,
            _endAt
        );

        return auction;
    }

    function placeBid(
        uint256 _nftId,
        address _nftContract,
        uint256 _bid
    ) external returns (bool) {
        Auction storage auction = auctionInfo[_nftContract][_nftId];

        require(msg.sender != auction.seller, "Auction: forbidden for owner!");

        if (
            auction.status == uint256(Status.WAIT) &&
            auction.startAt < block.timestamp &&
            auction.endAt > block.timestamp
        ) {
            auction.status = uint256(Status.ACTIVE);
        }

        require(
            auction.status == uint256(Status.ACTIVE),
            "Auction: not active!"
        );

        require(_bid > auction.minBid, "Auction: bid less than minimum!");
        require(_bid > auction.maxBid, "Auction: bid less than maximum!");

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

        emit Bid(_nftId, _nftContract, msg.sender, _bid);

        return true;
    }

    function finishAuction(uint256 _nftId, address _nftContract) external {
        Auction storage auction = auctionInfo[_nftContract][_nftId];

        require(
            (auction.endAt < block.timestamp &&
                (auction.status == uint256(Status.ACTIVE) ||
                    auction.status == uint256(Status.WAIT))),
            "Auction: cannot finish now!"
        );

        auction.status = uint256(Status.FINISHED);

        if (auction.maxBid > 0) {
            IERC20(auction.erc20Token).transfer(auction.seller, auction.maxBid);

            auction.ownerNft = auction.bidderWallet;
            auction.maxBid = 0;
            auction.bidderWallet = address(0);
        }

        emit Finish(_nftId, _nftContract, auction.seller, auction.ownerNft);
    }

    function withdrawNft(uint256 _nftId, address _nftContract) external {
        Auction storage auction = auctionInfo[_nftContract][_nftId];

        require(auction.ownerNft != address(0), "Auction: not exist!");

        require(
            auction.status == uint256(Status.FINISHED),
            "Auction: not finished!"
        );

        require(auction.ownerNft == msg.sender, "Auction: not owner NFT!");

        delete auctionInfo[_nftContract][_nftId];

        IERC721(_nftContract).safeTransferFrom(
            address(this),
            msg.sender,
            _nftId
        );

        emit Withdraw(_nftId, _nftContract, msg.sender);
    }
}

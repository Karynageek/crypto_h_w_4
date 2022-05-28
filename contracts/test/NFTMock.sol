//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFTMock is ERC721 {
    uint256 public tokenCounter;

    mapping(uint256 => string) private _tokenURIs;

    event PermanentURI(string _value, uint256 indexed _id);

    constructor() ERC721("Triangle", "TRI") {
        tokenCounter = 0;
    }

    function mint(string memory _tokenURI) public returns (uint256) {
        uint256 tokenID = tokenCounter;

        _safeMint(msg.sender, tokenID);

        tokenCounter++;

        _tokenURIs[tokenID] = _tokenURI;

        emit PermanentURI(_tokenURI, tokenID);

        return tokenID;
    }

    function tokenURI(uint256 _tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(
            _exists(_tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );

        return _tokenURIs[_tokenId];
    }
}

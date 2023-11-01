// SPDX-License-Identifier: GPL
pragma solidity ^0.8.9;

/**
 * @dev A struct storing a passpor credential
 */

struct Credential {
    string provider;
    bytes32 hash;
    uint64 issuanceDate;
    uint64 expirationDate;
}

/**
 * @dev A struct representing the passport score for an ETH address.
 */
struct Score {
    uint256 score;
    uint256 scorerID;
    uint256 decimals;
}

/**
 * @title IGitcoinPassportDecoder
 * @notice Minimal interface for consuming GitcoinPassportDecoder data
 */
interface IGitcoinPassportDecoder {
    function getPassport(
        address userAddress
    ) external returns (Credential[] memory);
}

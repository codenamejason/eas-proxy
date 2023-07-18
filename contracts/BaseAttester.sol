// SPDX-License-Identifier: GPL
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import { AttestationRequest, AttestationRequestData, IEAS, Attestation, MultiAttestationRequest, MultiRevocationRequest } from "@ethereum-attestation-service/eas-contracts/contracts/IEAS.sol";

/**
 * @title BaseAttester
 * @dev A contract that allows a Verifier contract to add passport information for users using Ethereum Attestation Service.
 */
contract BaseAttester is Ownable {
  // An allow-list of Verifiers that are authorized and trusted to call the submitAttestations function.
  mapping(address => bool) public verifiers;

  // The instance of the EAS contract.
  IEAS eas;

  // Emitted when a verifier is added to the allow-list.
  event VerifierAdded(address verifier);

  // Emitted when a verifier is removed from the allow-list.
  event VerifierRemoved(address verifier);

  /**
   * @dev Adds a verifier to the allow-list.
   * @param _verifier The address of the verifier to add.
   */
  function addVerifier(address _verifier) public onlyOwner {
    require(!verifiers[_verifier], "Verifier already added");
    verifiers[_verifier] = true;
    emit VerifierAdded(_verifier);
  }

  /**
   * @dev Removes a verifier from the allow-list.
   * @param _verifier The address of the verifier to remove.
   */
  function removeVerifier(address _verifier) public onlyOwner {
    require(verifiers[_verifier], "Verifier does not exist");
    verifiers[_verifier] = false;
    emit VerifierRemoved(_verifier);
  }

  /**
   * @dev Sets the address of the EAS contract.
   * @param _easContractAddress The address of the EAS contract.
   */
  function setEASAddress(address _easContractAddress) public onlyOwner {
    eas = IEAS(_easContractAddress);
  }

  /**
   * @dev Adds passport information for a user using EAS
   * @param multiAttestationRequest An array of `MultiAttestationRequest` structures containing the user's passport information.
   */
  function submitAttestations(
    MultiAttestationRequest[] calldata multiAttestationRequest
  ) public payable virtual returns (bytes32[] memory) {
    require(
      verifiers[msg.sender],
      "Only authorized verifiers can call this function"
    );

    return eas.multiAttest(multiAttestationRequest);
  }

  /**
   * @dev Revoke attestations by schema and uid
   * @param multiRevocationRequest An array of `MultiRevocationRequest` structures containing the attestations to revoke.
   */
  function revokeAttestations(
    MultiRevocationRequest[] calldata multiRevocationRequest
  ) public payable virtual {
    require(verifiers[msg.sender] || msg.sender == owner(), "Only authorized verifiers or owner can call this function");
    eas.multiRevoke(multiRevocationRequest);
  }
}

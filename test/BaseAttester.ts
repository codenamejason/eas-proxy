import {
  EAS,
  MultiRevocationRequest,
  NO_EXPIRATION,
  SchemaEncoder,
  ZERO_BYTES32,
} from "@ethereum-attestation-service/eas-sdk";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BaseAttester } from "../typechain-types";

const { utils, BigNumber } = ethers;

type Score = {
  score: number;
  scorer_id: number;
};

export const easEncodeScore = (score: Score) => {
  const schemaEncoder = new SchemaEncoder("uint32 score,uint32 scorer_id");
  const encodedData = schemaEncoder.encodeData([
    { name: "score", value: score.score, type: "uint32" },
    { name: "scorer_id", value: score.scorer_id, type: "uint32" },
  ]);
  return encodedData;
};

const encodedData = easEncodeScore({
  score: 0,
  scorer_id: 1234567890,
});

const attestationRequest = {
  recipient: "0x4A13F4394cF05a52128BdA527664429D5376C67f",
  expirationTime: NO_EXPIRATION,
  revocable: true,
  data: encodedData,
  refUID: ZERO_BYTES32,
  value: 0,
};

const gitcoinVCSchema =
  "0x853a55f39e2d1bf1e6731ae7148976fbbb0c188a898a233dba61a233d8c0e4a4";

const multiAttestationRequests = {
  schema: gitcoinVCSchema,
  data: [attestationRequest, attestationRequest, attestationRequest],
};

describe("BaseAttester", function () {
  // TODO: move tests out of "Deployment" describe block
  let baseAttester: BaseAttester,
    eas: EAS,
    EASContractAddress: string,
    owner: any,
    iamAccount: any,
    recipient: any,
    mockVerifier: any,
    nonOwnerOrVerifier: any;

  this.beforeAll(async function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployBaseAttester() {
      // Deployment and ABI: SchemaRegistry.json
      // Sepolia

      // v0.26

      // EAS:
      // Contract: 0xC2679fBD37d54388Ce493F1DB75320D236e1815e
      // Deployment and ABI: EAS.json
      // SchemaRegistry:
      // Contract: 0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0
      // Deployment and ABI: SchemaRegistry.json
      EASContractAddress = "0xC2679fBD37d54388Ce493F1DB75320D236e1815e"; // Sepolia v0.26

      // Contracts are deployed using the first signer/account by default
      const [
        ownerAccount,
        otherAccount,
        recipientAccount,
        mockVerifierAccount,
        nonOwnerOrVerifierAccount,
      ] = await ethers.getSigners();

      owner = ownerAccount;
      iamAccount = otherAccount;
      recipient = recipientAccount;
      mockVerifier = mockVerifierAccount;
      nonOwnerOrVerifier = nonOwnerOrVerifierAccount;

      const BaseAttester = await ethers.getContractFactory(
        "BaseAttester"
      );
      baseAttester = await BaseAttester.connect(owner).deploy();

      const provider = ethers.getDefaultProvider();

      // Initialize the sdk with the address of the EAS Schema contract address
      eas = new EAS(EASContractAddress);

      // Connects an ethers style provider/signingProvider to perform read/write functions.
      // MUST be a signer to do write operations!
      eas.connect(provider);
    }

    await loadFixture(deployBaseAttester);
  });
  describe("Attestations", function () {
    it("Should write multiple attestations", async function () {
      await baseAttester.setEASAddress(EASContractAddress);

      const tx = await baseAttester.addVerifier(owner.address);
      await tx.wait();

      const resultTx = await baseAttester.submitAttestations([
        multiAttestationRequests,
      ]);

      const result = await resultTx.wait();

      expect(result.events?.length).to.equal(
        multiAttestationRequests.data.length
      );
    });

    it("should revert when a non allowed address attempts to write attestations", async function () {
      await baseAttester.setEASAddress(EASContractAddress);
      await expect(
        baseAttester
          .connect(iamAccount)
          .submitAttestations([multiAttestationRequests])
      ).to.be.revertedWith("Only authorized verifiers can call this function");
    });

    it("should revert when non-owner tries to add a verifier", async function () {
      await expect(
        baseAttester.connect(iamAccount).addVerifier(recipient.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when non-owner tries to remove a verifier", async function () {
      await expect(
        baseAttester.connect(iamAccount).removeVerifier(owner.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should allow owner to add and remove verifier", async function () {
      const addTx = await baseAttester
        .connect(owner)
        .addVerifier(recipient.address);
      addTx.wait();

      expect(await baseAttester.verifiers(recipient.address)).to.equal(true);

      const removeTx = await baseAttester
        .connect(owner)
        .removeVerifier(recipient.address);
      removeTx.wait();

      expect(await baseAttester.verifiers(recipient.address)).to.equal(
        false
      );
    });

    it("Should revert when adding an existing verifier", async function () {
      const tx = await baseAttester
        .connect(owner)
        .addVerifier(recipient.address);
      tx.wait();

      expect(await baseAttester.verifiers(recipient.address)).to.equal(true);

      await expect(
        baseAttester.connect(owner).addVerifier(recipient.address)
      ).to.be.revertedWith("Verifier already added");
    });

    it("Should revert when removing a verifier not in the allow-list", async function () {
      await expect(
        baseAttester.connect(owner).removeVerifier(iamAccount.address)
      ).to.be.revertedWith("Verifier does not exist");
    });
  });
  describe("Revocation", function () {
    let multiRevocationRequest: MultiRevocationRequest[] = [];
    beforeEach(async function () {
      multiRevocationRequest = [];
      const tx = await baseAttester
        .connect(owner)
        .submitAttestations([multiAttestationRequests]);
      const attestationResult = await tx.wait();

      attestationResult.logs?.forEach((log: { topics: string[]; data: string; }) => {
        const decodedLog = eas.contract.interface.parseLog(log);
        const { schema, uid } = decodedLog.args;
        const value = BigNumber.from(0);
        const existingRevocationRequest = multiRevocationRequest.find(
          (r) => r.schema === schema
        );
        if (existingRevocationRequest) {
          existingRevocationRequest.data.push({
            uid,
            value,
          });
        } else {
          multiRevocationRequest.push({
            schema,
            data: [
              {
                uid,
                value,
              },
            ],
          });
        }
      });
    });
    it("should allow owner to revoke attestations", async function () {
      const revocationTx = await baseAttester
        .connect(owner)
        .revokeAttestations(multiRevocationRequest);

      const revocationResult = await revocationTx.wait();
      revocationResult.logs?.forEach(async (log: { topics: string[]; data: string; }, i: number) => {
        const parsedLogs = eas.contract.interface.parseLog(log);
        const { schema, uid } = parsedLogs.args;
        expect(schema).to.equal(multiRevocationRequest[0].schema);
        expect(uid).to.equal(multiRevocationRequest[0].data[i].uid);
        // check that each attestation was revoked by uid
        const revokedAttestation = await eas.connect(owner).getAttestation(uid);
        expect(revokedAttestation.revocationTime).to.not.equal(0);
      });
    });
    it("should allow verifier to revoke attestations", async function () {
      const tx = await baseAttester.addVerifier(mockVerifier.address);
      const addVerifierRecieptc = await tx.wait();
      const revocationTx = await baseAttester
        .connect(mockVerifier)
        .revokeAttestations(multiRevocationRequest);
      const revocationResult = await revocationTx.wait();
      revocationResult.logs?.forEach(async (log: { topics: string[]; data: string; }, i: number) => {
        const parsedLogs = eas.contract.interface.parseLog(log);
        const { schema, uid } = parsedLogs.args;
        expect(schema).to.equal(multiRevocationRequest[0].schema);
        expect(uid).to.equal(multiRevocationRequest[0].data[i].uid);
        // check that each attestation was revoked by uid
        const revokedAttestation = await eas.connect(owner).getAttestation(uid);
        expect(revokedAttestation.revocationTime).to.not.equal(0);
      });
    });
    it("should not allow non-owner to revoke attestations", async function () {
      await expect(
        baseAttester
          .connect(nonOwnerOrVerifier)
          .revokeAttestations(multiRevocationRequest)
      ).to.be.revertedWith(
        "Only authorized verifiers or owner can call this function"
      );
    });
  });
});

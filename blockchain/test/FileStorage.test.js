// FileStorage smart contract tests
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FileStorage", function () {
  let contract, admin, alice, bob, carol, outsider;
  const CID = "QmTestCid123";
  const HASH = ethers.sha256(ethers.toUtf8Bytes("hello world"));

  beforeEach(async function () {
    [admin, alice, bob, carol, outsider] = await ethers.getSigners();
    contract = await ethers.deployContract("FileStorage");

    await contract.registerUser(alice.address, "Student", "CSE", "SIT");
    await contract.registerUser(bob.address, "Student", "ECE", "SIT");
    await contract.registerUser(carol.address, "Faculty", "CSE", "SIT");
  });

  async function uploadAsAlice(role = "", dept = "CSE", org = "") {
    await contract.connect(alice).uploadFile(CID, "report.pdf", HASH, role, dept, org);
    return 1n;
  }

  describe("user registration", function () {
    it("sets the deployer as admin", async function () {
      expect(await contract.admin()).to.equal(admin.address);
    });

    it("stores user attributes", async function () {
      const u = await contract.getUser(alice.address);
      expect(u.role).to.equal("Student");
      expect(u.department).to.equal("CSE");
      expect(u.registered).to.equal(true);
    });

    it("only admin can register users", async function () {
      await expect(
        contract.connect(alice).registerUser(outsider.address, "Student", "CSE", "SIT")
      ).to.be.revertedWith("Only admin");
    });
  });

  describe("file upload", function () {
    it("records file metadata and emits FileUploaded", async function () {
      await expect(contract.connect(alice).uploadFile(CID, "report.pdf", HASH, "", "CSE", ""))
        .to.emit(contract, "FileUploaded")
        .withArgs(1n, alice.address, CID, "report.pdf");

      const f = await contract.getFile(1n);
      expect(f.owner).to.equal(alice.address);
      expect(f.cid).to.equal(CID);
      expect(f.contentHash).to.equal(HASH);
      expect(f.policy.department).to.equal("CSE");
      expect(f.active).to.equal(true);
      expect(await contract.getFilesByOwner(alice.address)).to.deep.equal([1n]);
    });

    it("rejects unregistered users", async function () {
      await expect(
        contract.connect(outsider).uploadFile(CID, "x", HASH, "", "", "")
      ).to.be.revertedWith("User not registered");
    });

    it("rejects an empty CID", async function () {
      await expect(
        contract.connect(alice).uploadFile("", "x", HASH, "", "", "")
      ).to.be.revertedWith("CID required");
    });
  });

  describe("attribute-based access control", function () {
    it("grants access when attributes match (CSE -> CSE)", async function () {
      const id = await uploadAsAlice();
      expect(await contract.canAccess(id, carol.address)).to.equal(true);
    });

    it("denies access when attributes differ (ECE -> CSE policy)", async function () {
      const id = await uploadAsAlice();
      expect(await contract.canAccess(id, bob.address)).to.equal(false);
    });

    it("requires all policy fields to match", async function () {
      const id = await uploadAsAlice("Faculty", "CSE", "SIT");
      expect(await contract.canAccess(id, carol.address)).to.equal(true); // Faculty CSE
      expect(await contract.canAccess(id, bob.address)).to.equal(false); // Student ECE
    });

    it("denies unregistered users", async function () {
      const id = await uploadAsAlice("", "", "");
      expect(await contract.canAccess(id, outsider.address)).to.equal(false);
    });

    it("owner always has access", async function () {
      const id = await uploadAsAlice("Faculty", "MECH", "Other");
      expect(await contract.canAccess(id, alice.address)).to.equal(true);
    });

    it("lists accessible files for a user", async function () {
      await uploadAsAlice();
      expect(await contract.getAccessibleFiles(carol.address)).to.deep.equal([1n]);
      expect(await contract.getAccessibleFiles(bob.address)).to.deep.equal([]);
    });
  });

  describe("grant, revoke and policy changes", function () {
    it("revocation blocks a user whose attributes match", async function () {
      const id = await uploadAsAlice();
      await expect(contract.connect(alice).revokeAccess(id, carol.address))
        .to.emit(contract, "AccessRevoked")
        .withArgs(id, carol.address);
      expect(await contract.canAccess(id, carol.address)).to.equal(false);
    });

    it("explicit grant allows a user whose attributes do not match", async function () {
      const id = await uploadAsAlice();
      await contract.connect(alice).grantAccess(id, bob.address);
      expect(await contract.canAccess(id, bob.address)).to.equal(true);
    });

    it("grant after revoke restores access", async function () {
      const id = await uploadAsAlice();
      await contract.connect(alice).revokeAccess(id, carol.address);
      await contract.connect(alice).grantAccess(id, carol.address);
      expect(await contract.canAccess(id, carol.address)).to.equal(true);
    });

    it("updating the policy changes who can access", async function () {
      const id = await uploadAsAlice();
      await contract.connect(alice).updatePolicy(id, "", "ECE", "");
      expect(await contract.canAccess(id, bob.address)).to.equal(true);
      expect(await contract.canAccess(id, carol.address)).to.equal(false);
    });

    it("deactivated file is only accessible to its owner", async function () {
      const id = await uploadAsAlice();
      await contract.connect(alice).setFileActive(id, false);
      expect(await contract.canAccess(id, carol.address)).to.equal(false);
      expect(await contract.canAccess(id, alice.address)).to.equal(true);
    });

    it("only the owner can manage a file", async function () {
      const id = await uploadAsAlice();
      await expect(contract.connect(bob).grantAccess(id, bob.address)).to.be.revertedWith("Only file owner");
      await expect(contract.connect(bob).revokeAccess(id, carol.address)).to.be.revertedWith("Only file owner");
      await expect(contract.connect(bob).updatePolicy(id, "", "", "")).to.be.revertedWith("Only file owner");
      await expect(contract.connect(bob).setFileActive(id, false)).to.be.revertedWith("Only file owner");
    });

    it("reverts for a file that does not exist", async function () {
      await expect(contract.canAccess(99n, alice.address)).to.be.revertedWith("File does not exist");
    });
  });

  describe("audit log", function () {
    it("records granted and denied access requests", async function () {
      const id = await uploadAsAlice();
      await expect(contract.connect(carol).requestAccess(id))
        .to.emit(contract, "AccessRequested")
        .withArgs(id, carol.address, true);
      await expect(contract.connect(bob).requestAccess(id))
        .to.emit(contract, "AccessRequested")
        .withArgs(id, bob.address, false);
    });
  });
});

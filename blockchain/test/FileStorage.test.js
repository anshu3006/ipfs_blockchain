// FileStorage smart contract tests
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const HOUR = 3600;
const DAY = 24 * HOUR;

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
        .withArgs(id, carol.address, alice.address);
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
      await expect(contract.connect(bob).grantAccess(id, bob.address)).to.be.revertedWith(
        "Only file owner or an active delegate"
      );
      await expect(contract.connect(bob).revokeAccess(id, carol.address)).to.be.revertedWith(
        "Only file owner or an active delegate"
      );
      await expect(contract.connect(bob).updatePolicy(id, "", "", "")).to.be.revertedWith("Only file owner");
      await expect(contract.connect(bob).setFileActive(id, false)).to.be.revertedWith("Only file owner");
    });

    it("reverts for a file that does not exist", async function () {
      await expect(contract.canAccess(99n, alice.address)).to.be.revertedWith("File does not exist");
    });
  });

  describe("temporary grants", function () {
    it("owner's temporary grant expires automatically", async function () {
      const id = await uploadAsAlice();
      const until = (await time.latest()) + DAY;
      await contract.connect(alice).grantTemporaryAccess(id, bob.address, until);
      expect(await contract.canAccess(id, bob.address)).to.equal(true);

      await time.increaseTo(until + 1);
      expect(await contract.canAccess(id, bob.address)).to.equal(false);
    });

    it("rejects an expiry in the past", async function () {
      const id = await uploadAsAlice();
      const past = (await time.latest()) - 1;
      await expect(
        contract.connect(alice).grantTemporaryAccess(id, bob.address, past)
      ).to.be.revertedWith("Expiry must be in the future");
    });
  });

  describe("delegation with limits", function () {
    // alice owns the file, carol is the delegate (e.g. a TA), bob and outsider are users
    let id, delegationEnd;

    beforeEach(async function () {
      id = await uploadAsAlice();
      delegationEnd = (await time.latest()) + 7 * DAY;
      await contract.connect(alice).delegateManagement(id, carol.address, delegationEnd);
    });

    it("records the delegation and emits ManagementDelegated", async function () {
      expect(await contract.isDelegate(id, carol.address)).to.equal(true);
      const [delegates, expiries] = await contract.getDelegates(id);
      expect(delegates).to.deep.equal([carol.address]);
      expect(expiries).to.deep.equal([BigInt(delegationEnd)]);
      expect(await contract.getManagedFiles(carol.address)).to.deep.equal([id]);
    });

    it("a delegate can grant access, capped at the delegation's end", async function () {
      await expect(contract.connect(carol).grantAccess(id, bob.address))
        .to.emit(contract, "AccessGranted")
        .withArgs(id, bob.address, carol.address, delegationEnd);
      expect(await contract.canAccess(id, bob.address)).to.equal(true);
      expect(await contract.grantExpiry(id, bob.address)).to.equal(BigInt(delegationEnd));
    });

    it("a delegate's shorter temporary grant keeps its own expiry", async function () {
      const until = (await time.latest()) + DAY;
      await contract.connect(carol).grantTemporaryAccess(id, bob.address, until);
      await time.increaseTo(until + 1);
      expect(await contract.canAccess(id, bob.address)).to.equal(false);
    });

    it("a delegate can revoke access", async function () {
      await contract.registerUser(outsider.address, "Student", "CSE", "SIT");
      expect(await contract.canAccess(id, outsider.address)).to.equal(true);
      await expect(contract.connect(carol).revokeAccess(id, outsider.address))
        .to.emit(contract, "AccessRevoked")
        .withArgs(id, outsider.address, carol.address);
      expect(await contract.canAccess(id, outsider.address)).to.equal(false);
    });

    it("everything the delegate did stops when the delegation expires", async function () {
      await contract.connect(carol).grantAccess(id, bob.address);
      await time.increaseTo(delegationEnd + 1);

      expect(await contract.isDelegate(id, carol.address)).to.equal(false);
      expect(await contract.canAccess(id, bob.address)).to.equal(false);
      expect(await contract.getManagedFiles(carol.address)).to.deep.equal([]);
      await expect(contract.connect(carol).grantAccess(id, outsider.address)).to.be.revertedWith(
        "Only file owner or an active delegate"
      );
    });

    it("revoking the delegation early also cancels the delegate's grants", async function () {
      await contract.connect(carol).grantAccess(id, bob.address);
      await expect(contract.connect(alice).revokeDelegation(id, carol.address))
        .to.emit(contract, "DelegationRevoked")
        .withArgs(id, carol.address);
      expect(await contract.canAccess(id, bob.address)).to.equal(false);
      await expect(contract.connect(carol).revokeAccess(id, bob.address)).to.be.revertedWith(
        "Only file owner or an active delegate"
      );
    });

    it("owner grants are not affected by a delegation ending", async function () {
      await contract.connect(alice).grantAccess(id, bob.address);
      await contract.connect(alice).revokeDelegation(id, carol.address);
      expect(await contract.canAccess(id, bob.address)).to.equal(true);
    });

    it("a delegate cannot grant itself access", async function () {
      await expect(contract.connect(carol).grantAccess(id, carol.address)).to.be.revertedWith(
        "Delegates cannot grant themselves access"
      );
    });

    it("a delegate cannot undo the owner's revocation", async function () {
      await contract.connect(alice).revokeAccess(id, bob.address);
      await expect(contract.connect(carol).grantAccess(id, bob.address)).to.be.revertedWith(
        "User was revoked by the owner"
      );
      // ...but the owner can
      await contract.connect(alice).grantAccess(id, bob.address);
      expect(await contract.canAccess(id, bob.address)).to.equal(true);
    });

    it("a delegate cannot change the policy, deactivate or delegate further", async function () {
      await expect(contract.connect(carol).updatePolicy(id, "", "", "")).to.be.revertedWith("Only file owner");
      await expect(contract.connect(carol).setFileActive(id, false)).to.be.revertedWith("Only file owner");
      await expect(
        contract.connect(carol).delegateManagement(id, bob.address, delegationEnd)
      ).to.be.revertedWith("Only file owner");
    });

    it("only the owner can delegate, and only to registered users with a future expiry", async function () {
      const future = (await time.latest()) + DAY;
      await expect(
        contract.connect(bob).delegateManagement(id, bob.address, future)
      ).to.be.revertedWith("Only file owner");
      await expect(
        contract.connect(alice).delegateManagement(id, outsider.address, future)
      ).to.be.revertedWith("Delegate not registered");
      await expect(
        contract.connect(alice).delegateManagement(id, bob.address, (await time.latest()) - 1)
      ).to.be.revertedWith("Expiry must be in the future");
      await expect(
        contract.connect(alice).delegateManagement(id, alice.address, future)
      ).to.be.revertedWith("Invalid delegate");
    });

    it("re-delegating updates the expiry without duplicating the delegate", async function () {
      const later = delegationEnd + 7 * DAY;
      await contract.connect(alice).delegateManagement(id, carol.address, later);
      const [delegates, expiries] = await contract.getDelegates(id);
      expect(delegates).to.deep.equal([carol.address]);
      expect(expiries).to.deep.equal([BigInt(later)]);
    });
  });

  describe("versioning and key rotation", function () {
    const Reason = { Initial: 0n, Revocation: 1n, KeyCompromise: 2n, ContentUpdate: 3n };
    const NEW_CID = "QmRotatedCid456";
    const NEW_HASH = ethers.sha256(ethers.toUtf8Bytes("hello world v2"));
    let id;

    beforeEach(async function () {
      id = await uploadAsAlice();
    });

    it("the first upload is version 1 with reason Initial", async function () {
      const versions = await contract.getVersions(id);
      expect(versions.length).to.equal(1);
      expect(versions[0].cid).to.equal(CID);
      expect(versions[0].contentHash).to.equal(HASH);
      expect(versions[0].reason).to.equal(Reason.Initial);
      expect(versions[0].by).to.equal(alice.address);
      expect((await contract.getFile(id)).version).to.equal(1n);
    });

    it("owner key rotation changes the CID but keeps the content hash", async function () {
      await expect(contract.connect(alice).rotateKey(id, NEW_CID, Reason.KeyCompromise))
        .to.emit(contract, "KeyRotated")
        .withArgs(id, alice.address, Reason.KeyCompromise, 2n, NEW_CID);

      const f = await contract.getFile(id);
      expect(f.cid).to.equal(NEW_CID);
      expect(f.contentHash).to.equal(HASH);
      expect(f.version).to.equal(2n);

      const versions = await contract.getVersions(id);
      expect(versions.map((v) => v.cid)).to.deep.equal([CID, NEW_CID]);
      expect(versions[1].contentHash).to.equal(HASH);
      expect(versions[1].reason).to.equal(Reason.KeyCompromise);
    });

    it("rotation does not change who can access the file", async function () {
      await contract.connect(alice).rotateKey(id, NEW_CID, Reason.KeyCompromise);
      expect(await contract.canAccess(id, carol.address)).to.equal(true);
      expect(await contract.canAccess(id, bob.address)).to.equal(false);
    });

    it("revokeAndRotate revokes the user and records a Revocation version in one transaction", async function () {
      const tx = contract.connect(alice).revokeAndRotate(id, carol.address, NEW_CID);
      await expect(tx).to.emit(contract, "AccessRevoked").withArgs(id, carol.address, alice.address);
      await expect(tx).to.emit(contract, "KeyRotated").withArgs(id, alice.address, Reason.Revocation, 2n, NEW_CID);
      expect(await contract.canAccess(id, carol.address)).to.equal(false);
      expect((await contract.getFile(id)).cid).to.equal(NEW_CID);
    });

    it("rejects an empty CID, the same CID, or a non-rotation reason", async function () {
      await expect(contract.connect(alice).rotateKey(id, "", Reason.KeyCompromise)).to.be.revertedWith("CID required");
      await expect(contract.connect(alice).rotateKey(id, CID, Reason.KeyCompromise)).to.be.revertedWith(
        "New CID must differ from the current one"
      );
      await expect(contract.connect(alice).rotateKey(id, NEW_CID, Reason.ContentUpdate)).to.be.revertedWith(
        "Rotation reason must be Revocation or KeyCompromise"
      );
      await expect(contract.connect(alice).rotateKey(id, NEW_CID, Reason.Initial)).to.be.revertedWith(
        "Rotation reason must be Revocation or KeyCompromise"
      );
    });

    it("only the owner or an active delegate can rotate", async function () {
      await expect(contract.connect(bob).rotateKey(id, NEW_CID, Reason.KeyCompromise)).to.be.revertedWith(
        "Only file owner or an active delegate"
      );
    });

    it("a delegate can rotate after a revocation, but not for key compromise", async function () {
      await contract.connect(alice).delegateManagement(id, carol.address, (await time.latest()) + DAY);
      await expect(contract.connect(carol).rotateKey(id, NEW_CID, Reason.KeyCompromise)).to.be.revertedWith(
        "Delegates can rotate only after a revocation"
      );
      await contract.registerUser(outsider.address, "Student", "CSE", "SIT");
      await expect(contract.connect(carol).revokeAndRotate(id, outsider.address, NEW_CID))
        .to.emit(contract, "KeyRotated")
        .withArgs(id, carol.address, Reason.Revocation, 2n, NEW_CID);
    });

    it("owner can add a new content version with a new hash", async function () {
      await expect(contract.connect(alice).addVersion(id, NEW_CID, NEW_HASH))
        .to.emit(contract, "VersionAdded")
        .withArgs(id, alice.address, 2n, NEW_CID);
      const f = await contract.getFile(id);
      expect(f.contentHash).to.equal(NEW_HASH);
      expect(f.version).to.equal(2n);
      const versions = await contract.getVersions(id);
      expect(versions[1].reason).to.equal(Reason.ContentUpdate);
      expect(versions[0].contentHash).to.equal(HASH); // history kept
    });

    it("only the owner can add a content version, even a delegate cannot", async function () {
      await contract.connect(alice).delegateManagement(id, carol.address, (await time.latest()) + DAY);
      await expect(contract.connect(carol).addVersion(id, NEW_CID, NEW_HASH)).to.be.revertedWith("Only file owner");
    });

    it("keeps a growing history across rotations and updates", async function () {
      await contract.connect(alice).rotateKey(id, "QmA", Reason.KeyCompromise);
      await contract.connect(alice).addVersion(id, "QmB", NEW_HASH);
      await contract.connect(alice).revokeAndRotate(id, bob.address, "QmC");
      const versions = await contract.getVersions(id);
      expect(versions.map((v) => v.reason)).to.deep.equal([
        Reason.Initial,
        Reason.KeyCompromise,
        Reason.ContentUpdate,
        Reason.Revocation,
      ]);
      expect((await contract.getFile(id)).version).to.equal(4n);
      expect(versions[3].contentHash).to.equal(NEW_HASH); // rotation keeps the latest content's hash
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

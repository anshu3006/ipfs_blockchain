// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FileStorage
/// @notice Records IPFS file metadata on-chain and enforces attribute-based
///         access control (ABAC). The files themselves live (encrypted) on IPFS;
///         only the CID, a content hash and the access policy are stored here.
contract FileStorage {
    // ---------------------------------------------------------------- types

    struct User {
        string role;         // e.g. "Student", "Faculty"
        string department;   // e.g. "CSE", "ECE"
        string organization; // e.g. "SIT"
        bool registered;
    }

    /// An empty string in a policy field means "any value is allowed".
    struct Policy {
        string role;
        string department;
        string organization;
    }

    struct File {
        uint256 id;
        address owner;
        string cid;          // IPFS content identifier of the encrypted file
        string name;
        bytes32 contentHash; // sha256 of the original file, for integrity checks
        Policy policy;
        bool active;
        uint256 uploadedAt;
    }

    // ---------------------------------------------------------------- state

    address public admin;
    uint256 public fileCount;

    mapping(address => User) private users;
    mapping(uint256 => File) private files;
    mapping(address => uint256[]) private ownerFiles;
    // fileId => user => explicitly granted (bypasses policy)
    mapping(uint256 => mapping(address => bool)) public explicitGrant;
    // fileId => user => revoked (overrides policy and grant)
    mapping(uint256 => mapping(address => bool)) public revoked;

    // ---------------------------------------------------------------- events (audit log)

    event UserRegistered(address indexed user, string role, string department, string organization);
    event FileUploaded(uint256 indexed fileId, address indexed owner, string cid, string name);
    event PolicyUpdated(uint256 indexed fileId, string role, string department, string organization);
    event AccessGranted(uint256 indexed fileId, address indexed user);
    event AccessRevoked(uint256 indexed fileId, address indexed user);
    event FileStatusChanged(uint256 indexed fileId, bool active);
    event AccessRequested(uint256 indexed fileId, address indexed user, bool granted);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ---------------------------------------------------------------- modifiers

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyRegistered() {
        require(users[msg.sender].registered, "User not registered");
        _;
    }

    modifier fileExists(uint256 fileId) {
        require(fileId > 0 && fileId <= fileCount, "File does not exist");
        _;
    }

    modifier onlyOwner(uint256 fileId) {
        require(files[fileId].owner == msg.sender, "Only file owner");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------------------------------------------------------------- admin

    /// @notice Register a user or update their attributes.
    function registerUser(
        address user,
        string calldata role,
        string calldata department,
        string calldata organization
    ) external onlyAdmin {
        require(user != address(0), "Invalid address");
        users[user] = User(role, department, organization, true);
        emit UserRegistered(user, role, department, organization);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ---------------------------------------------------------------- files

    function uploadFile(
        string calldata cid,
        string calldata name,
        bytes32 contentHash,
        string calldata policyRole,
        string calldata policyDepartment,
        string calldata policyOrganization
    ) external onlyRegistered returns (uint256) {
        require(bytes(cid).length > 0, "CID required");

        fileCount++;
        uint256 id = fileCount;
        File storage f = files[id];
        f.id = id;
        f.owner = msg.sender;
        f.cid = cid;
        f.name = name;
        f.contentHash = contentHash;
        f.policy = Policy(policyRole, policyDepartment, policyOrganization);
        f.active = true;
        f.uploadedAt = block.timestamp;
        ownerFiles[msg.sender].push(id);

        emit FileUploaded(id, msg.sender, cid, name);
        emit PolicyUpdated(id, policyRole, policyDepartment, policyOrganization);
        return id;
    }

    function updatePolicy(
        uint256 fileId,
        string calldata role,
        string calldata department,
        string calldata organization
    ) external fileExists(fileId) onlyOwner(fileId) {
        files[fileId].policy = Policy(role, department, organization);
        emit PolicyUpdated(fileId, role, department, organization);
    }

    /// @notice Give a specific user access regardless of the policy (also clears a revocation).
    function grantAccess(uint256 fileId, address user) external fileExists(fileId) onlyOwner(fileId) {
        revoked[fileId][user] = false;
        explicitGrant[fileId][user] = true;
        emit AccessGranted(fileId, user);
    }

    /// @notice Block a specific user, even if their attributes match the policy.
    function revokeAccess(uint256 fileId, address user) external fileExists(fileId) onlyOwner(fileId) {
        explicitGrant[fileId][user] = false;
        revoked[fileId][user] = true;
        emit AccessRevoked(fileId, user);
    }

    function setFileActive(uint256 fileId, bool active) external fileExists(fileId) onlyOwner(fileId) {
        files[fileId].active = active;
        emit FileStatusChanged(fileId, active);
    }

    /// @notice Records an access attempt in the audit log and returns the decision.
    function requestAccess(uint256 fileId) external fileExists(fileId) returns (bool granted) {
        granted = canAccess(fileId, msg.sender);
        emit AccessRequested(fileId, msg.sender, granted);
    }

    // ---------------------------------------------------------------- access decision

    /// @notice ABAC decision: owner > inactive > revoked > explicit grant > attribute match.
    function canAccess(uint256 fileId, address user) public view fileExists(fileId) returns (bool) {
        File storage f = files[fileId];
        if (user == f.owner) return true;
        if (!f.active) return false;
        if (revoked[fileId][user]) return false;
        if (explicitGrant[fileId][user]) return true;

        User storage u = users[user];
        if (!u.registered) return false;
        return _matches(f.policy.role, u.role)
            && _matches(f.policy.department, u.department)
            && _matches(f.policy.organization, u.organization);
    }

    function _matches(string storage required, string storage actual) private view returns (bool) {
        if (bytes(required).length == 0) return true;
        return keccak256(bytes(required)) == keccak256(bytes(actual));
    }

    // ---------------------------------------------------------------- views

    function getUser(address user) external view returns (User memory) {
        return users[user];
    }

    function getFile(uint256 fileId) external view fileExists(fileId) returns (File memory) {
        return files[fileId];
    }

    function getFilesByOwner(address owner) external view returns (uint256[] memory) {
        return ownerFiles[owner];
    }

    /// @notice All file ids `user` can currently access (excluding their own).
    function getAccessibleFiles(address user) external view returns (uint256[] memory) {
        uint256 count;
        for (uint256 i = 1; i <= fileCount; i++) {
            if (files[i].owner != user && canAccess(i, user)) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 j;
        for (uint256 i = 1; i <= fileCount; i++) {
            if (files[i].owner != user && canAccess(i, user)) result[j++] = i;
        }
        return result;
    }
}

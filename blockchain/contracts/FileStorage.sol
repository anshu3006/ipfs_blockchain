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
    uint64 private constant FOREVER = type(uint64).max;

    // fileId => user => when an explicit grant (bypassing the policy) ends; 0 = no grant
    mapping(uint256 => mapping(address => uint64)) public grantExpiry;
    // fileId => user => who made that grant (the owner, or a delegate)
    mapping(uint256 => mapping(address => address)) public grantedBy;
    // fileId => user => revoked (overrides policy and grant)
    mapping(uint256 => mapping(address => bool)) public revoked;
    // fileId => user => who revoked them (a delegate cannot undo the owner's revocation)
    mapping(uint256 => mapping(address => address)) public revokedBy;

    // fileId => delegate => when their right to manage the file ends; 0 = never delegated
    mapping(uint256 => mapping(address => uint64)) public delegationExpiry;
    mapping(uint256 => address[]) private delegateList;
    mapping(address => uint256[]) private delegatedFileIds;
    mapping(uint256 => mapping(address => bool)) private everDelegated;

    // ---------------------------------------------------------------- events (audit log)

    event UserRegistered(address indexed user, string role, string department, string organization);
    event FileUploaded(uint256 indexed fileId, address indexed owner, string cid, string name);
    event PolicyUpdated(uint256 indexed fileId, string role, string department, string organization);
    event AccessGranted(uint256 indexed fileId, address indexed user, address by, uint64 expiresAt);
    event AccessRevoked(uint256 indexed fileId, address indexed user, address by);
    event ManagementDelegated(uint256 indexed fileId, address indexed owner, address indexed delegate, uint64 expiresAt);
    event DelegationRevoked(uint256 indexed fileId, address indexed delegate);
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

    modifier onlyOwnerOrDelegate(uint256 fileId) {
        require(
            files[fileId].owner == msg.sender || isDelegate(fileId, msg.sender),
            "Only file owner or an active delegate"
        );
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
    ///         From the owner it never expires; from a delegate it lasts while their delegation does.
    function grantAccess(uint256 fileId, address user)
        external
        fileExists(fileId)
        onlyOwnerOrDelegate(fileId)
    {
        _grant(fileId, user, FOREVER);
    }

    /// @notice Like grantAccess, but the grant ends at `expiresAt` (unix seconds).
    function grantTemporaryAccess(uint256 fileId, address user, uint64 expiresAt)
        external
        fileExists(fileId)
        onlyOwnerOrDelegate(fileId)
    {
        require(expiresAt > block.timestamp, "Expiry must be in the future");
        _grant(fileId, user, expiresAt);
    }

    /// @notice Block a specific user, even if their attributes match the policy.
    function revokeAccess(uint256 fileId, address user)
        external
        fileExists(fileId)
        onlyOwnerOrDelegate(fileId)
    {
        grantExpiry[fileId][user] = 0;
        grantedBy[fileId][user] = address(0);
        revoked[fileId][user] = true;
        revokedBy[fileId][user] = msg.sender;
        emit AccessRevoked(fileId, user, msg.sender);
    }

    function _grant(uint256 fileId, address user, uint64 expiresAt) private {
        require(user != address(0), "Invalid address");
        if (msg.sender != files[fileId].owner) {
            // A delegate manages access for others; it cannot open the file for itself,
            // and its grants never outlive its own delegation.
            require(user != msg.sender, "Delegates cannot grant themselves access");
            require(
                !(revoked[fileId][user] && revokedBy[fileId][user] == files[fileId].owner),
                "User was revoked by the owner"
            );
            uint64 limit = delegationExpiry[fileId][msg.sender];
            if (expiresAt > limit) expiresAt = limit;
        }
        revoked[fileId][user] = false;
        revokedBy[fileId][user] = address(0);
        grantExpiry[fileId][user] = expiresAt;
        grantedBy[fileId][user] = msg.sender;
        emit AccessGranted(fileId, user, msg.sender, expiresAt);
    }

    // ---------------------------------------------------------------- delegation

    /// @notice Let `delegate` grant and revoke access to this file until `expiresAt` (unix seconds).
    ///         Delegates cannot change the policy, deactivate the file or delegate further.
    ///         Calling again for the same delegate changes the expiry.
    function delegateManagement(uint256 fileId, address delegate, uint64 expiresAt)
        external
        fileExists(fileId)
        onlyOwner(fileId)
    {
        require(delegate != address(0) && delegate != msg.sender, "Invalid delegate");
        require(users[delegate].registered, "Delegate not registered");
        require(expiresAt > block.timestamp, "Expiry must be in the future");

        delegationExpiry[fileId][delegate] = expiresAt;
        if (!everDelegated[fileId][delegate]) {
            everDelegated[fileId][delegate] = true;
            delegateList[fileId].push(delegate);
            delegatedFileIds[delegate].push(fileId);
        }
        emit ManagementDelegated(fileId, msg.sender, delegate, expiresAt);
    }

    /// @notice End a delegation early. Grants that delegate made stop working too.
    function revokeDelegation(uint256 fileId, address delegate) external fileExists(fileId) onlyOwner(fileId) {
        require(isDelegate(fileId, delegate), "Not an active delegate");
        delegationExpiry[fileId][delegate] = 0;
        emit DelegationRevoked(fileId, delegate);
    }

    function isDelegate(uint256 fileId, address account) public view returns (bool) {
        return delegationExpiry[fileId][account] > block.timestamp;
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

    /// @notice ABAC decision: owner > inactive > revoked > active explicit grant > attribute match.
    function canAccess(uint256 fileId, address user) public view fileExists(fileId) returns (bool) {
        File storage f = files[fileId];
        if (user == f.owner) return true;
        if (!f.active) return false;
        if (revoked[fileId][user]) return false;
        if (hasActiveGrant(fileId, user)) return true;

        User storage u = users[user];
        if (!u.registered) return false;
        return _matches(f.policy.role, u.role)
            && _matches(f.policy.department, u.department)
            && _matches(f.policy.organization, u.organization);
    }

    /// @notice A grant counts while it hasn't expired and, if a delegate made it, while that delegation lasts.
    function hasActiveGrant(uint256 fileId, address user) public view returns (bool) {
        if (grantExpiry[fileId][user] <= block.timestamp) return false;
        address by = grantedBy[fileId][user];
        return by == files[fileId].owner || isDelegate(fileId, by);
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

    /// @notice Active delegates of a file and when each delegation ends.
    function getDelegates(uint256 fileId)
        external
        view
        fileExists(fileId)
        returns (address[] memory delegates, uint64[] memory expiries)
    {
        address[] storage all = delegateList[fileId];
        uint256 count;
        for (uint256 i = 0; i < all.length; i++) {
            if (isDelegate(fileId, all[i])) count++;
        }
        delegates = new address[](count);
        expiries = new uint64[](count);
        uint256 j;
        for (uint256 i = 0; i < all.length; i++) {
            if (isDelegate(fileId, all[i])) {
                delegates[j] = all[i];
                expiries[j++] = delegationExpiry[fileId][all[i]];
            }
        }
    }

    /// @notice File ids `delegate` can currently manage.
    function getManagedFiles(address delegate) external view returns (uint256[] memory) {
        uint256[] storage all = delegatedFileIds[delegate];
        uint256 count;
        for (uint256 i = 0; i < all.length; i++) {
            if (isDelegate(all[i], delegate)) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < all.length; i++) {
            if (isDelegate(all[i], delegate)) result[j++] = all[i];
        }
        return result;
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

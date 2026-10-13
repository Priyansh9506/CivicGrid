/*
 * Practical - 9: Role-Based Authentication and Access Control (RBAC) System
 * Defines roles, permissions, role hierarchy, and access verification utilities.
 */

const crypto = require('crypto');

// Available Roles in CivicGrid
const ROLES = {
    CITIZEN: 'citizen',
    OFFICER: 'officer',
    ADMIN: 'admin'
};

const ROLE_LIST = [ROLES.CITIZEN, ROLES.OFFICER, ROLES.ADMIN];

// Fine-grained Permissions
const PERMISSIONS = {
    // Complaint domain
    COMPLAINT_READ: 'complaint:read',
    COMPLAINT_CREATE: 'complaint:create',
    COMPLAINT_STATUS_UPDATE: 'complaint:status:update',
    COMPLAINT_DELETE_OWN: 'complaint:delete:own',
    COMPLAINT_DELETE_ANY: 'complaint:delete:any',
    COMPLAINT_INSPECT: 'complaint:inspect',

    // User management domain (Admin only)
    USER_READ: 'user:read',
    USER_ROLE_UPDATE: 'user:role:update',

    // System audit & governance
    RBAC_AUDIT: 'rbac:audit',
    PROFILE_READ: 'profile:read'
};

// Role-to-Permissions Mapping Matrix
const ROLE_PERMISSIONS = {
    [ROLES.CITIZEN]: [
        PERMISSIONS.PROFILE_READ,
        PERMISSIONS.COMPLAINT_READ,
        PERMISSIONS.COMPLAINT_CREATE,
        PERMISSIONS.COMPLAINT_DELETE_OWN
    ],
    [ROLES.OFFICER]: [
        PERMISSIONS.PROFILE_READ,
        PERMISSIONS.COMPLAINT_READ,
        PERMISSIONS.COMPLAINT_CREATE,
        PERMISSIONS.COMPLAINT_STATUS_UPDATE,
        PERMISSIONS.COMPLAINT_INSPECT
    ],
    [ROLES.ADMIN]: [
        PERMISSIONS.PROFILE_READ,
        PERMISSIONS.COMPLAINT_READ,
        PERMISSIONS.COMPLAINT_CREATE,
        PERMISSIONS.COMPLAINT_STATUS_UPDATE,
        PERMISSIONS.COMPLAINT_DELETE_OWN,
        PERMISSIONS.COMPLAINT_DELETE_ANY,
        PERMISSIONS.COMPLAINT_INSPECT,
        PERMISSIONS.USER_READ,
        PERMISSIONS.USER_ROLE_UPDATE,
        PERMISSIONS.RBAC_AUDIT
    ]
};

// Role Metadata for Display and Governance
const ROLE_METADATA = {
    [ROLES.CITIZEN]: {
        name: 'Citizen',
        badge: '👤 Citizen',
        color: 'sky',
        description: 'Public community member. Can report civic issues, track progress, and manage their own reported complaints.',
        level: 1
    },
    [ROLES.OFFICER]: {
        name: 'Field Officer',
        badge: '🛡️ Officer',
        color: 'amber',
        description: 'Municipal staff & ward inspector. Can inspect reports and update complaint lifecycle statuses on Kanban and List views.',
        level: 2
    },
    [ROLES.ADMIN]: {
        name: 'Administrator',
        badge: '👑 Admin',
        color: 'purple',
        description: 'Municipal Commissioner / System Admin. Full system authority including user role assignment, audits, and complaint moderation.',
        level: 3
    }
};

/**
 * Checks if a given role possesses a specific permission.
 */
function hasPermission(role, permission) {
    if (!role || !ROLE_PERMISSIONS[role]) return false;
    return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Hash a password using scrypt with random salt.
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

// Pre-seeded demo credentials for instant demonstration & viva testing
const DEMO_USERS = [
    {
        firstName: 'Aarav',
        lastName: 'Mehta',
        mobileNumber: '9876543210',
        aadharNumber: '111122223333',
        emailId: 'citizen@civicgrid.org',
        password: 'Citizen@123',
        role: ROLES.CITIZEN,
        address: 'B-204, Shivalik Residency, Satellite, Ahmedabad'
    },
    {
        firstName: 'Inspector',
        lastName: 'Patel',
        mobileNumber: '9876543211',
        aadharNumber: '222233334444',
        emailId: 'officer@civicgrid.org',
        password: 'Officer@123',
        role: ROLES.OFFICER,
        address: 'Ward Office 7, Municipal Corporation, Ahmedabad'
    },
    {
        firstName: 'Commissioner',
        lastName: 'Sharma',
        mobileNumber: '9876543212',
        aadharNumber: '333344445555',
        emailId: 'admin@civicgrid.org',
        password: 'Admin@123',
        role: ROLES.ADMIN,
        address: 'Headquarters, AMC Central Office, Ahmedabad'
    }
];

module.exports = {
    ROLES,
    ROLE_LIST,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_METADATA,
    DEMO_USERS,
    hasPermission,
    hashPassword
};

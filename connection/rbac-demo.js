/*
 * Practical - 9: Role-Based Authentication and Access Control (RBAC) Demo
 * Demonstrates:
 *   1. Role Hierarchy and Permissions Matrix in JavaScript
 *   2. Policy enforcement (ALLOW vs 403 FORBIDDEN)
 *   3. Database verification of user roles & dynamic role elevation
 *
 * Run:  npm run rbac-demo   (or: node connection/rbac-demo.js)
 */

const { initDatabase, closeConnection } = require('./setup');
const { query, closePool } = require('./db');
const {
    ROLES,
    ROLE_LIST,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_METADATA,
    hasPermission
} = require('./rbac');
const { explainDbError } = require('./config');

function evaluateAccess(user, action, context = {}) {
    const role = user?.role || ROLES.CITIZEN;
    const permissions = ROLE_PERMISSIONS[role] || [];

    switch (action) {
        case 'CREATE_COMPLAINT':
            return {
                allowed: permissions.includes(PERMISSIONS.COMPLAINT_CREATE),
                reason: `Role '${role}' has permission 'complaint:create'`
            };

        case 'UPDATE_STATUS':
            if (permissions.includes(PERMISSIONS.COMPLAINT_STATUS_UPDATE)) {
                return {
                    allowed: true,
                    reason: `Role '${role}' is authorized for workflow status changes`
                };
            }
            return {
                allowed: false,
                reason: `403 Forbidden: Citizens cannot modify complaint status. Requires Officer or Admin.`
            };

        case 'DELETE_COMPLAINT':
            if (permissions.includes(PERMISSIONS.COMPLAINT_DELETE_ANY)) {
                return {
                    allowed: true,
                    reason: `Admin has universal delete authorization`
                };
            }
            if (permissions.includes(PERMISSIONS.COMPLAINT_DELETE_OWN) && context.isOwner) {
                return {
                    allowed: true,
                    reason: `Citizen allowed to delete own reported complaint`
                };
            }
            return {
                allowed: false,
                reason: `403 Forbidden: Cannot delete complaint owned by another user without Admin privilege.`
            };

        case 'MANAGE_ROLES':
            if (permissions.includes(PERMISSIONS.USER_ROLE_UPDATE)) {
                return {
                    allowed: true,
                    reason: `Admin authorized for system user & role management`
                };
            }
            return {
                allowed: false,
                reason: `403 Forbidden: Role management is strictly restricted to Administrators.`
            };

        default:
            return { allowed: false, reason: 'Unknown action' };
    }
}

async function main() {
    console.log('================================================================');
    console.log('   PRACTICAL - 9: ROLE-BASED ACCESS CONTROL (RBAC) DEMO');
    console.log('================================================================\n');

    // 1. Roles & Hierarchy Overview
    console.log('--- 1. DEFINED ROLES & HIERARCHY ---');
    const rolesTable = ROLE_LIST.map(r => ({
        Role: r.toUpperCase(),
        Level: ROLE_METADATA[r].level,
        Title: ROLE_METADATA[r].name,
        PermissionsCount: ROLE_PERMISSIONS[r].length,
        Description: ROLE_METADATA[r].description
    }));
    console.table(rolesTable);

    // 2. Full RBAC Permission Matrix
    console.log('\n--- 2. RBAC PERMISSIONS MATRIX ---');
    const allPermissions = Object.values(PERMISSIONS);
    const matrix = allPermissions.map(perm => ({
        Permission: perm,
        Citizen: hasPermission(ROLES.CITIZEN, perm) ? '✅ ALLOWED' : '❌ DENIED',
        Officer: hasPermission(ROLES.OFFICER, perm) ? '✅ ALLOWED' : '❌ DENIED',
        Admin:   hasPermission(ROLES.ADMIN, perm)   ? '✅ ALLOWED' : '❌ DENIED'
    }));
    console.table(matrix);

    // 3. Simulated Access Control Checks
    console.log('\n--- 3. POLICY ENFORCEMENT & ACCESS CONTROL SIMULATION ---');
    const scenarios = [
        { user: { name: 'Aarav (Citizen)', role: ROLES.CITIZEN }, action: 'CREATE_COMPLAINT', ctx: {} },
        { user: { name: 'Aarav (Citizen)', role: ROLES.CITIZEN }, action: 'UPDATE_STATUS', ctx: {} },
        { user: { name: 'Aarav (Citizen)', role: ROLES.CITIZEN }, action: 'DELETE_COMPLAINT', ctx: { isOwner: true } },
        { user: { name: 'Aarav (Citizen)', role: ROLES.CITIZEN }, action: 'DELETE_COMPLAINT', ctx: { isOwner: false } },
        { user: { name: 'Inspector Patel (Officer)', role: ROLES.OFFICER }, action: 'UPDATE_STATUS', ctx: {} },
        { user: { name: 'Inspector Patel (Officer)', role: ROLES.OFFICER }, action: 'MANAGE_ROLES', ctx: {} },
        { user: { name: 'Commissioner Sharma (Admin)', role: ROLES.ADMIN }, action: 'MANAGE_ROLES', ctx: {} },
        { user: { name: 'Commissioner Sharma (Admin)', role: ROLES.ADMIN }, action: 'DELETE_COMPLAINT', ctx: { isOwner: false } }
    ];

    const scenarioResults = scenarios.map(s => {
        const res = evaluateAccess(s.user, s.action, s.ctx);
        return {
            Actor: s.user.name,
            Action: s.action + (s.ctx.isOwner !== undefined ? (s.ctx.isOwner ? ' (Own)' : ' (Other)') : ''),
            Decision: res.allowed ? '✅ 200 OK' : '⛔ 403 FORBIDDEN',
            Reason: res.reason
        };
    });
    console.table(scenarioResults);

    // 4. Live MySQL Database Verification
    console.log('\n--- 4. LIVE MYSQL DATABASE USER ROLES ---');
    const setupConn = await initDatabase();
    await closeConnection(setupConn, () => {});

    const users = await query('SELECT id, first_name, last_name, email, role, created_at FROM users ORDER BY id');
    console.table(users.map(u => ({
        ID: u.id,
        Name: `${u.first_name} ${u.last_name}`,
        Email: u.email,
        Role: u.role.toUpperCase(),
        Registered: new Date(u.created_at).toLocaleDateString()
    })));

    // 5. Dynamic Role Elevation Demo
    console.log('\n--- 5. DYNAMIC ROLE ELEVATION (ADMIN ACTION) ---');
    const targetUser = users.find(u => u.role === ROLES.CITIZEN);
    if (targetUser) {
        console.log(`Original state: ${targetUser.email} has role '${targetUser.role}'`);
        await query('UPDATE users SET role = ? WHERE id = ?', [ROLES.OFFICER, targetUser.id]);
        const [elevated] = await query('SELECT email, role FROM users WHERE id = ?', [targetUser.id]);
        console.log(`Elevated state: ${elevated.email} promoted to role '${elevated.role}'`);

        // Revert back so demo stays consistent
        await query('UPDATE users SET role = ? WHERE id = ?', [ROLES.CITIZEN, targetUser.id]);
        console.log(`Reset state:    ${elevated.email} restored to role '${ROLES.CITIZEN}'`);
    }

    console.log('\n================================================================');
    console.log('   RBAC DEMONSTRATION COMPLETE');
    console.log('================================================================');
}

main()
    .catch(err => {
        console.error(explainDbError(err));
        process.exitCode = 1;
    })
    .finally(() => closePool().then(() => console.log('Database pool connection closed.')));

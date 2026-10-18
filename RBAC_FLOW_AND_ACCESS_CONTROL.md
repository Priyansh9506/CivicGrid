# Practical 9: Role-Based Authentication and Access Control (RBAC) System

> **Course:** Full Stack Development (FSD) Lab  
> **Branch:** `practical-9`  
> **Project:** CivicGrid — Area-Wise Civic Issue & Task Management System  
> **Technology Stack:** JavaScript (Node.js, Express, Vue.js 3, Tailwind CSS, MySQL)

---

## 📌 1. Overview & Objective

In **Practical 9**, CivicGrid implements a production-grade **Role-Based Authentication and Access Control (RBAC)** architecture in JavaScript. 

The system enforces **Defense-in-Depth**:
1. **Authentication (AuthN):** Secure user identification using `scrypt` password hashing and HttpOnly session cookies.
2. **Access Control (AuthZ):** Authorization enforced on the backend through Express middlewares (`requireAuth`, `requireRole`, `requirePermission`), validated against MySQL database state.
3. **Adaptive UI Layer:** Frontend (Vue.js + Tailwind) dynamically hides or disables buttons, locks Kanban drag-and-drop, and shows role-specific administrative views based on the active user's permissions.

---

## 🔑 Demo Login IDs & Passwords (Quick Reference)

For instant login, testing, and viva demonstration, use the following pre-seeded credentials:

| Role | Name | Login Email ID | Password | Authority Summary |
|---|---|---|---|---|
| 👤 **Citizen** | Aarav Mehta | `citizen@civicgrid.org` | `Citizen@123` | Can report complaints, view map, delete own complaints. Cannot change status. |
| 🛡️ **Field Officer** | Inspector Patel | `officer@civicgrid.org` | `Officer@123` | Can advance Kanban cards & mark complete. Cannot delete complaints. |
| 👑 **Administrator** | Commissioner Sharma | `admin@civicgrid.org` | `Admin@123` | Full governance: manage user roles, delete any complaint, access admin panel. |

> 💡 **Tip:** On the web login page (`login.html`), you can also simply click the **1-Click Demo Buttons** to sign in directly without typing!

---

## 👥 2. User Roles & Hierarchy

CivicGrid defines **three distinct hierarchical roles**, each corresponding to a specific stakeholder persona in municipal administration:

```
               ┌──────────────────────────────┐
               │    👑 Administrator (Lvl 3)   │
               │  Municipal Commissioner / IT │
               └──────────────┬───────────────┘
                              │ inherits & expands
               ┌──────────────▼───────────────┐
               │   🛡️ Field Officer (Lvl 2)   │
               │  Ward Inspector / Supervisor │
               └──────────────┬───────────────┘
                              │ inherits basic
               ┌──────────────▼───────────────┐
               │     👤 Citizen (Lvl 1)       │
               │    Public Community Member   │
               └──────────────────────────────┘
```

### Role Metadata Summary

| Role Key | Display Badge | Authority Level | Description |
|---|---|:---:|---|
| `citizen` | 👤 **Citizen** | **Level 1** | Public resident. Can report issues with photos and GPS, track civic complaints, and manage/delete **only their own** reported issues. |
| `officer` | 🛡️ **Field Officer** | **Level 2** | Municipal ward staff / ground inspector. Can review all incoming complaints, advance workflow stages via Kanban drag-and-drop, and update statuses (`reported` → `inprogress` → `resolved`). Cannot alter system users or delete records. |
| `admin` | 👑 **Administrator** | **Level 3** | Municipal Commissioner / System Admin. Holds universal governance: can moderate/delete any complaint, inspect audit trails, and elevate or demote user roles dynamically. |

---

## 🔐 3. Fine-Grained Permissions & Access Control Matrix

The system maps roles to 10 fine-grained atomic permissions defined in `connection/rbac.js`:

```javascript
// Defined in connection/rbac.js
const PERMISSIONS = {
    COMPLAINT_READ:          'complaint:read',
    COMPLAINT_CREATE:        'complaint:create',
    COMPLAINT_STATUS_UPDATE: 'complaint:status:update',
    COMPLAINT_DELETE_OWN:    'complaint:delete:own',
    COMPLAINT_DELETE_ANY:    'complaint:delete:any',
    COMPLAINT_INSPECT:       'complaint:inspect',
    USER_READ:               'user:read',
    USER_ROLE_UPDATE:        'user:role:update',
    RBAC_AUDIT:              'rbac:audit',
    PROFILE_READ:            'profile:read'
};
```

### Role-to-Permission Mapping Matrix

| # | Permission Key | Action / Scope | 👤 Citizen | 🛡️ Officer | 👑 Admin |
|:---:|---|---|:---:|:---:|:---:|
| 1 | `profile:read` | View own user profile & active session credentials | ✅ **Allowed** | ✅ **Allowed** | ✅ **Allowed** |
| 2 | `complaint:read` | View area-wise civic complaints on map, list, & Kanban | ✅ **Allowed** | ✅ **Allowed** | ✅ **Allowed** |
| 3 | `complaint:create` | Lodge new complaint with GPS coordinates & photo | ✅ **Allowed** | ✅ **Allowed** | ✅ **Allowed** |
| 4 | `complaint:status:update` | Change workflow status (`reported`, `inprogress`, `resolved`) | ⛔ **Denied (403)** | ✅ **Allowed** | ✅ **Allowed** |
| 5 | `complaint:delete:own` | Delete complaint submitted by oneself | ✅ **Allowed** | ⛔ **Denied (403)** | ✅ **Allowed** |
| 6 | `complaint:delete:any` | Delete any complaint lodged by any citizen or officer | ⛔ **Denied (403)** | ⛔ **Denied (403)** | ✅ **Allowed** |
| 7 | `complaint:inspect` | Inspect complaint audit log, timestamps & changer info | ⛔ **Denied (403)** | ✅ **Allowed** | ✅ **Allowed** |
| 8 | `user:read` | Retrieve list of registered system users & complaint counts | ⛔ **Denied (403)** | ⛔ **Denied (403)** | ✅ **Allowed** |
| 9 | `user:role:update` | Promote, demote, or reassign system user roles | ⛔ **Denied (403)** | ⛔ **Denied (403)** | ✅ **Allowed** |
| 10 | `rbac:audit` | View role assignments and governance activity | ⛔ **Denied (403)** | ⛔ **Denied (403)** | ✅ **Allowed** |

---

## 👤 4. Authority & Access by a Particular Person

### 1. Citizen Persona (e.g. *Aarav Mehta* — `citizen@civicgrid.org`)

* **Role Level:** 1
* **Authority Scope:** Personal Civic Grievances.
* **What this person CAN do:**
  * Register an account with role `citizen`.
  * Sign in and view their personal profile.
  * Browse the public civic feed across zones (Paldi, Satellite, Navrangpura, etc.).
  * File new civic issues with descriptions, GPS location, and uploaded photo proofs.
  * Delete a complaint that **they themselves created** (`task.createdBy === state.userId`).
* **What this person CANNOT do (Forbidden):**
  * Cannot drag and drop Kanban cards or change status to `inprogress` or `resolved` (enforced with HTTP `403 Forbidden`).
  * Cannot see or use the `Complete` or `Undo` status toggle buttons.
  * Cannot delete complaints reported by other citizens.
  * Cannot view the Administrator Governance Panel or list of other users.
* **Frontend UI State for Citizen:**
  * Displays sky-blue `👤 Citizen` badge.
  * Kanban shows banner: *"🔒 Drag & drop is disabled for your role. Only Officers and Admins can update complaint statuses."*
  * Admin Management Panel is hidden (`display: none`).

---

### 2. Field Officer Persona (e.g. *Inspector Patel* — `officer@civicgrid.org`)

* **Role Level:** 2
* **Authority Scope:** Ward Lifecycle & Task Resolution.
* **What this person CAN do:**
  * Sign in and inspect all reported civic issues.
  * Drag and drop complaint cards across Kanban columns (`Reported` → `In Progress` → `Resolved`).
  * Click `Mark Complete` or `Undo` in the list view to advance complaint workflow.
  * Every status modification automatically records an entry in `complaint_status_history` logging the officer's ID, timestamp, and source (`kanban` or `list`).
* **What this person CANNOT do (Forbidden):**
  * Cannot delete complaints (neither own nor others') — preventing field officers from destroying audit evidence or erasing unresolved civic problems.
  * Cannot manage or view system user accounts or elevate user privileges.
* **Frontend UI State for Officer:**
  * Displays amber-gold `🛡️ Officer` badge.
  * Kanban drag-and-drop is fully unlocked and active.
  * `Complete` and `Undo` buttons are visible on each complaint.
  * `Remove` button is hidden from list cards.
  * Admin Management Panel is hidden.

---

### 3. Administrator Persona (e.g. *Commissioner Sharma* — `admin@civicgrid.org`)

* **Role Level:** 3
* **Authority Scope:** Full System Governance & Oversight.
* **What this person CAN do:**
  * Has universal access to all endpoints.
  * Advance or revert complaint statuses on Kanban or List view.
  * Delete any complaint in the database (moderation capability).
  * Access the **User Management Panel**:
    * Views all registered users with their name, email, Aadhar number, mobile, address, and total complaints filed.
    * Dynamically changes any user's role from a dropdown (`Citizen` ↔ `Officer` ↔ `Admin`), instantly updating MySQL records.
  * Inspect complete complaint status audit trails.
* **What this person CANNOT do:**
  * Cannot demote themselves if they are the sole active administrator.
* **Frontend UI State for Administrator:**
  * Displays purple `👑 Admin` badge.
  * Kanban drag-and-drop fully functional.
  * `Remove` button visible on all complaints.
  * **Admin Panel** (`#adminPanel`) is prominently rendered above the map showing the live User Governance table and role elevation dropdowns.

---

## 🔄 5. System Execution & Data Flows

### Flow 1: Authentication & Session Creation Flow

```
[ User Browser ]                  [ Express Server ]                 [ MySQL Database ]
       │                                  │                                  │
       │── POST /api/auth/login ─────────>│                                  │
       │   { emailId, password }          │                                  │
       │                                  │── SELECT * FROM users ──────────>│
       │                                  │<── returns user record + salt ───│
       │                                  │                                  │
       │                                  │ [verifyPassword(scrypt)]         │
       │                                  │ [crypto.randomBytes(32) token]   │
       │                                  │                                  │
       │                                  │── INSERT INTO sessions ─────────>│
       │                                  │<── session stored (7-day exp) ───│
       │                                  │                                  │
       │<── Set-Cookie: civicgrid_session ┤                                  │
       │    HttpOnly; SameSite=Lax        │                                  │
       │    { user, role, permissions }   │                                  │
```

---

### Flow 2: RBAC Request Interception & Authorization Flow

```
Incoming Request (e.g. PATCH /api/complaints/12/status)
                    │
                    ▼
          [ requireAuth Middleware ]
          Reads 'civicgrid_session' cookie
                    │
           Token valid & active?
               ├── No  ───> 401 Unauthorized: "Please sign in."
               └── Yes ───> Attaches req.user from DB session
                    │
                    ▼
          [ requireRole(OFFICER, ADMIN) / requirePermission ]
          Checks if req.user.role satisfies required policy
                    │
             Role authorized?
               ├── No  ───> 403 Forbidden: "Access Denied: Requires role [officer or admin]."
               └── Yes ───> Proceeds to Controller
                    │
                    ▼
          [ Database Transaction ]
          1. UPDATE complaints SET status = ?
          2. INSERT INTO complaint_status_history (complaint_id, changer, old, new)
                    │
                    ▼
          200 OK + Updated Complaint Object
```

---

### Flow 3: Complaint Deletion Flow (Ownership Check vs Universal Admin)

```
[ DELETE /api/complaints/:id ]
              │
              ▼
    Retrieve complaint record
              │
              ├── User is ADMIN?
              │     └── Allowed: Delete record from MySQL ───> 200 OK
              │
              ├── User is CITIZEN?
              │     ├── complaint.user_id === req.user.id
              │     │     └── Allowed: Citizen deletes own complaint ───> 200 OK
              │     └── complaint.user_id !== req.user.id
              │           └── 403 Forbidden: "Citizens can only delete their own reported complaints."
              │
              └── User is OFFICER?
                    └── 403 Forbidden: "Field Officers cannot delete complaints. Contact an Admin."
```

---

### Flow 4: Dynamic Role Elevation Flow (Admin Only)

```
[ Admin in Browser ]              [ Express Server ]                 [ MySQL Database ]
       │                                  │                                  │
       │── PATCH /api/admin/users/:id/role│                                  │
       │   { role: 'officer' }            │                                  │
       │                                  │ [requireAuth + requireRole(ADMIN)│
       │                                  │                                  │
       │                                  │── UPDATE users SET role='officer'│
       │                                  │   WHERE id = :id ───────────────>│
       │                                  │<── 1 row affected ───────────────│
       │                                  │                                  │
       │<── 200 OK { message: "Role       │                                  │
       │    updated successfully" } ──────┤                                  │
```

---

## 💻 6. Key JavaScript Code Implementations

### 1. RBAC Policy Engine (`connection/rbac.js`)

```javascript
function hasPermission(role, permission) {
    if (!role || !ROLE_PERMISSIONS[role]) return false;
    return ROLE_PERMISSIONS[role].includes(permission);
}
```

### 2. Express Authorization Middlewares (`server.js`)

```javascript
// Middleware: Enforces that user has at least one of the specified roles
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
        const userRole = req.user.role || ROLES.CITIZEN;
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: `Access Denied: Requires role [${allowedRoles.join(' or ')}]. Your current role is [${userRole}].`,
                requiredRoles: allowedRoles,
                userRole
            });
        }
        next();
    };
}

// Middleware: Enforces fine-grained permission string
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
        const userRole = req.user.role || ROLES.CITIZEN;
        if (hasPermission(userRole, permission)) return next();
        return res.status(403).json({
            error: `Access Denied: Role '${userRole}' lacks permission '${permission}'.`,
            requiredPermission: permission,
            userRole
        });
    };
}
```

### 3. Role-Protected Endpoint Example (`server.js`)

```javascript
// Status updates restricted to Field Officers and Administrators
app.patch('/api/complaints/:id/status', 
    requireAuth, 
    requireRole(ROLES.OFFICER, ROLES.ADMIN), 
    async (req, res) => {
        const { status } = req.body;
        // Status transition logic + audit log entry
    }
);
```

### 4. Client-Side Reactive Permission Binding (`index.html`)

```javascript
function applyUserSession(user) {
    currentUser = user;
    const role = user.role || 'citizen';
    const perms = user.permissions || [];

    // Push permission flags into Vue reactive state
    if (window.vueComponent) {
        window.vueComponent.state.userRole = role;
        window.vueComponent.state.userId = user.id;
        window.vueComponent.state.canUpdateStatus = perms.includes('complaint:status:update');
        window.vueComponent.state.canDeleteAny = perms.includes('complaint:delete:any');
        window.vueComponent.state.canDeleteOwn = perms.includes('complaint:delete:own');
    }

    // Toggle Admin Panel visibility
    const adminPanel = document.getElementById('adminPanel');
    if (perms.includes('user:role:update')) {
        adminPanel.classList.remove('rbac-hidden');
        loadAdminUsers();
    } else {
        adminPanel.classList.add('rbac-hidden');
    }
}
```

---

## 🧪 7. Pre-Seeded Demo Credentials & Fast Role Switcher

For live viva evaluation, testing, and demonstration without manual registration, three pre-seeded accounts are permanently configured in `connection/rbac.js` and seeded into the MySQL `users` table:

### Detailed Account Profiles

| Field | 👤 Citizen | 🛡️ Field Officer | 👑 Administrator |
|---|---|---|---|
| **Full Name** | Aarav Mehta | Inspector Patel | Commissioner Sharma |
| **Role Key** | `citizen` (Level 1) | `officer` (Level 2) | `admin` (Level 3) |
| **Login Email ID** | `citizen@civicgrid.org` | `officer@civicgrid.org` | `admin@civicgrid.org` |
| **Password** | `Citizen@123` | `Officer@123` | `Admin@123` |
| **Mobile Number** | `9876543210` | `9876543211` | `9876543212` |
| **Aadhar Number** | `111122223333` | `222233334444` | `333344445555` |
| **Address** | B-204, Shivalik Residency, Satellite, Ahmedabad | Ward Office 7, Municipal Corporation, Ahmedabad | Headquarters, AMC Central Office, Ahmedabad |
| **Permissions Count** | 4 atomic permissions | 5 atomic permissions | 10 atomic permissions (Full Access) |
| **Primary Privilege** | Lodge issue & delete own | Update status via Kanban / List | User role management & full moderation |

### ⚡ 1-Click Role Switcher Feature
When logged in, the application header on `index.html` includes instant switcher buttons (`👤 Citizen`, `🛡️ Officer`, `👑 Admin`). Clicking any button switches the active server session via `/api/auth/switch-demo-role` and updates the entire UI in real time without having to manually log out and log back in.

---

## 🚀 8. How to Run the Demonstration

### Method A: CLI Demonstration Script
Run the standalone policy simulation and database verification script:
```bash
npm run rbac-demo
# or
node connection/rbac-demo.js
```
This prints the complete **Role Hierarchy table**, the **Full Permissions Matrix**, and evaluates **8 security access scenarios** showing explicit `200 OK` vs `403 FORBIDDEN` decisions.

### Method B: Full Web Application Demonstration
1. Start MySQL in XAMPP (Port 3306 or 3307 matching your `.env`).
2. Run database migration and seed default demo users:
   ```bash
   npm run setup
   ```
3. Start the Express server:
   ```bash
   npm start
   ```
4. Open your browser:
   * **Login Page:** [http://localhost:3000/login.html](http://localhost:3000/login.html)
   * **Main App & RBAC Dashboard:** [http://localhost:3000/index.html](http://localhost:3000/index.html)
   * Use the **1-Click Demo Buttons** to switch between Citizen, Officer, and Admin to observe real-time access control differences.

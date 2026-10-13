# CivicGrid — Practical 9: Role-Based Authentication and Access Control (RBAC)

Demonstrates a complete **Role-Based Authentication and Access Control (RBAC)** system using JavaScript (Node.js/Express backend + Vue.js/Tailwind frontend + MySQL database) built on top of Practical 8.

---

## 🚀 Quick Start

1. Start **MySQL** (and Apache for phpMyAdmin) in the XAMPP Control Panel.  
   *(Make sure `DB_PORT` in `.env` matches your MySQL port, e.g. 3306 or 3307).*
2. Install dependencies & run:
   ```bash
   npm install
   npm run setup       # Migrates database schema (adds role column) and seeds demo users
   npm start           # Starts the Express server on http://localhost:3000
   ```
3. Open **http://localhost:3000/login.html** in your browser.

> **Note:** Do not open HTML files directly (`file://…`) as they communicate with the backend REST API via HttpOnly session cookies.

---

## 👥 Roles & Permissions Architecture

CivicGrid defines three discrete hierarchical roles:

| Role | Badge | Level | Permissions Summary | Description |
|---|---|:---:|---|---|
| **Citizen** | 👤 Citizen | 1 | `profile:read`, `complaint:read`, `complaint:create`, `complaint:delete:own` | Community members. Can report civic issues, track progress, and delete only their own reported complaints. **Cannot** change lifecycle status. |
| **Officer** | 🛡️ Officer | 2 | `profile:read`, `complaint:read`, `complaint:create`, `complaint:status:update`, `complaint:inspect` | Municipal ward staff. Can inspect complaints, drag-and-drop on Kanban, and mark complaints Complete/Undo. |
| **Admin** | 👑 Admin | 3 | All permissions (`complaint:*`, `user:read`, `user:role:update`, `rbac:audit`) | Municipal commissioner / administrator. Full governance: universal complaint moderation/deletion, user role assignments, and system audits. |

---

## 📋 RBAC Permission Matrix

| Permission Key | Description | 👤 Citizen | 🛡️ Officer | 👑 Admin |
|---|---|:---:|:---:|:---:|
| `profile:read` | View authenticated user profile | ✅ | ✅ | ✅ |
| `complaint:read` | View all civic complaints | ✅ | ✅ | ✅ |
| `complaint:create` | Report a new complaint (with photo) | ✅ | ✅ | ✅ |
| `complaint:status:update` | Update complaint status (Kanban drop / List toggle) | ❌ | ✅ | ✅ |
| `complaint:delete:own` | Delete complaint submitted by oneself | ✅ | ❌ | ✅ |
| `complaint:delete:any` | Delete any complaint submitted by anyone | ❌ | ❌ | ✅ |
| `complaint:inspect` | Inspect detailed complaint metadata & logs | ❌ | ✅ | ✅ |
| `user:read` | View registered system users list | ❌ | ❌ | ✅ |
| `user:role:update` | Elevate or modify user roles | ❌ | ❌ | ✅ |
| `rbac:audit` | View RBAC governance audit logs | ❌ | ❌ | ✅ |

---

## 🔑 Pre-Seeded Demo Accounts

For instant testing and evaluation without manual signup:

| Role | Email | Password | Pre-configured Privileges |
|---|---|---|---|
| **Citizen** | `citizen@civicgrid.org` | `Citizen@123` | Can report complaints, view issues, delete own complaints |
| **Officer** | `officer@civicgrid.org` | `Officer@123` | Can advance Kanban cards and resolve complaints |
| **Admin** | `admin@civicgrid.org` | `Admin@123` | Can manage user roles, delete any complaint, access admin panel |

*Quick login buttons are available directly on `login.html`.*

---

## 🧪 CLI Demonstration Script

You can verify the entire JavaScript RBAC implementation, policy evaluation engine, and database verification directly in the terminal:

```bash
npm run rbac-demo
```

This script:
1. Prints the **Role Hierarchy** and **Full Permission Matrix**.
2. Evaluates access for various security scenarios (returns `200 OK` or `403 FORBIDDEN`).
3. Verifies users and their `role` values directly in the MySQL `users` table.
4. Simulates dynamic role elevation and demotion by an administrator.

---

## 🖥️ User Interface RBAC Features

- **One-Click Demo Sign-In (`login.html`)**: Fast buttons to sign in as Citizen, Officer, or Admin.
- **Role Badge (`index.html`)**: Prominent color-coded badge (`👤 Citizen`, `🛡️ Officer`, `👑 Admin`) displaying current authority in the header.
- **Fast Role Switcher**: Interactive switcher allows immediate switching between demo accounts to compare views in real-time.
- **Live Permission Matrix Modal**: Click *"View My Permissions"* to inspect active permissions granted to your role.
- **Role-Aware Kanban Board**:
  - **Officers & Admins**: Can drag and drop cards between `Reported`, `In Progress`, and `Resolved` columns.
  - **Citizens**: Drag-and-drop is locked with a "Read-Only" indicator; status changes return `403 Forbidden` if attempted.
- **Role-Aware List View**:
  - `Complete` / `Undo` buttons are only shown to **Officers** and **Admins**.
  - `Remove` button is available only for complaints owned by the current **Citizen**, or for **Admins** unconditionally.
- **Admin Management Panel (`index.html`)**:
  - Visible only to **Admin** users.
  - Lists all registered users and their complaint counts.
  - Real-time dropdown to elevate/demote any user's role (`Citizen` ↔ `Officer` ↔ `Admin`).
- **Registration (`registration.html`)**:
  - Allows registering new accounts with an assigned role for testing.

---

## 🗄️ Database Schema Updates

The `users` table schema now includes the `role` column:

```sql
ALTER TABLE users ADD COLUMN role ENUM('citizen', 'officer', 'admin') NOT NULL DEFAULT 'citizen';
```

Automatic migration and demo seeding is handled in [`connection/setup.js`](connection/setup.js).

---

## 🌐 API Reference

### Authentication & RBAC

| Method | Path | Auth / Role Required | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register new user (with role assignment) |
| POST | `/api/auth/login` | Public | Sign in and receive HttpOnly session cookie |
| GET | `/api/auth/me` | Authenticated | Get current user profile, role, and permissions |
| POST | `/api/auth/demo-switch` | Authenticated | Switch active session to any demo role account |
| POST | `/api/auth/logout` | Authenticated | Sign out and destroy session |
| GET | `/api/rbac/permissions` | Authenticated | Get system permissions matrix and metadata |

### Complaints (Role Protected)

| Method | Path | Role / Permission | Description |
|---|---|---|---|
| GET | `/api/complaints` | `complaint:read` | List complaints for area / user |
| POST | `/api/complaints` | `complaint:create` | Create new complaint (`multipart/form-data`) |
| GET | `/api/complaints/:id/image` | Public / Auth | View complaint photo from MySQL `LONGBLOB` |
| PATCH | `/api/complaints/:id/status` | `complaint:status:update` *(Officer/Admin)* | Update complaint status (`reported`, `inprogress`, `resolved`) |
| DELETE | `/api/complaints/:id` | `complaint:delete:own` or `complaint:delete:any` | Remove complaint (ownership-verified for Citizens, universal for Admin) |
| GET | `/api/complaints/:id/history` | `complaint:read` | Audit log of status transitions |

### Admin User Management

| Method | Path | Role / Permission | Description |
|---|---|---|---|
| GET | `/api/admin/users` | **Admin only** (`user:read`) | List all users with role and stats |
| PATCH | `/api/admin/users/:id/role` | **Admin only** (`user:role:update`) | Elevate or change a user's role |

---

## 📂 Project Structure

```
CivicGrid/
├── connection/
│   ├── config.js         # MySQL configuration and environment bindings
│   ├── db.js             # MySQL connection pool
│   ├── schema.js         # Database tables with role column
│   ├── setup.js          # DB creation, migration & demo user seeder
│   ├── rbac.js           # Core RBAC module: roles, permissions matrix, helpers
│   ├── rbac-demo.js      # CLI RBAC demonstration & policy evaluation script
│   └── crud.js           # User-defined CRUD functions
├── app.js                # Frontend logic: Leaflet map, role-aware list view, drag & drop
├── index.html            # Main SPA: Role badge, switcher, permissions matrix, admin panel, Vue Kanban
├── login.html            # Login page with one-click demo role sign-in
├── registration.html     # Registration page with role selector
├── server.js             # Express server with RBAC middleware & protected endpoints
└── package.json          # npm scripts including setup, start, and rbac-demo
```

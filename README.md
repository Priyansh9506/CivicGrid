# CivicGrid — Practical 8 (Node.js + MySQL)

Area-wise civic complaint manager. Login, complaints (with photos) and Kanban status
changes are stored in MySQL through a Node.js/Express server.

## Run it

1. Start **MySQL** (and Apache for phpMyAdmin) in the XAMPP Control Panel. `DB_PORT` in `.env` must match the MySQL port: 3307 here, because MySQL 8 (service `MySQL80`) already uses 3306.
2. In the VS Code terminal:
   ```
   npm install
   npm start
   ```
3. Open **http://localhost:3000**. Register, then sign in.

Do not open the HTML files directly (`file://…`): the pages need the server for their API calls.

The server creates the `civicgrid` database, its tables and some sample complaints on first start.
If your MySQL user or password differs from XAMPP's default (`root`, empty password),
set it in `.env`. Copy [.env.example](.env.example) to `.env` if you don't have one yet.
Git ignores `.env`, so your password stays out of commits.

## Practical 8 scripts

| Command | What it shows |
|---|---|
| `npm run setup` | **I.** Create a database, create a table, insert a record, update the record ([connection/setup.js](connection/setup.js)) |
| `npm run crud-demo` | **II.** User-defined functions: delete record, select record, select unique, select all ([connection/crud.js](connection/crud.js), [connection/crud-demo.js](connection/crud-demo.js)) |

## Database (`civicgrid`)

| Table | Stores |
|---|---|
| `users` | Registration details; the password is stored as a salted scrypt hash |
| `sessions` | Login sessions (an HttpOnly cookie holds the token) |
| `zones` | The five areas and their map coordinates |
| `complaints` | Issue, reporter details, area, status, GPS/map pin, and the **photo as a `LONGBLOB`** |
| `complaint_status_history` | Every status change: created, Kanban drag & drop, list Complete/Undo |

View the data in **MySQL Workbench** (connect to `localhost:3306` → schema `civicgrid`), or in phpMyAdmin if you use XAMPP's MySQL.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in (sets the session cookie) |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/complaints` | All complaints |
| POST | `/api/complaints` | New complaint (`multipart/form-data`, optional `image` up to 5 MB) |
| GET | `/api/complaints/:id/image` | Photo stored in MySQL |
| PATCH | `/api/complaints/:id/status` | Change status (`{ status, source }`) |
| GET | `/api/complaints/:id/history` | Status change log |
| DELETE | `/api/complaints/:id` | Remove complaint |

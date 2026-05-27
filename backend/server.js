const crypto = require("crypto");
const util = require("util");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { Pool } = require("pg");
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@company.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@12345";
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || "chinmay@company.com";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || "Manager@12345";
const TEAMLEAD_EMAIL = process.env.TEAMLEAD_EMAIL || "lead@company.com";
const TEAMLEAD_PASSWORD = process.env.TEAMLEAD_PASSWORD || "TeamLead@12345";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL || "akash@company.com";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD || "Employee@12345";

app.use(cors());
app.use(express.json());
app.get("/", (_req, res) => res.redirect("http://localhost:5173/"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const scryptAsync = util.promisify(crypto.scrypt);
const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

const ratingKeysSelf = [
  "innovation", "goalAchievement", "teamWork", "commitment", "technicalLearning", "softwareSupport",
  "graphicsLearning", "siteActivities", "communication", "problemSolving", "timeManagement"
];
const requiredSelfTextKeys = [
  "skillsLearned", "softwareHardware", "graphicsSkills", "siteActivitiesSummary", "achievements", "challenges", "selfComments"
];
const ratingKeysReviewer = ["quality", "productivity", "jobKnowledge", "communication", "teamwork", "initiative", "reliability", "leadership"];
const requiredReviewerTextKeys = ["strengths", "improvements", "developmentPlan", "comments"];

function isRating1to5(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, key] = String(storedHash).split(":");
  if (!salt || !key) return false;
  const derived = await scryptAsync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(derived));
}

function issueToken(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS, user });
  return token;
}

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token || !sessions.has(token)) return res.status(401).json({ error: "Unauthorized" });
  const s = sessions.get(token);
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: "Session expired" });
  }
  req.user = s.user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

async function seedUser({ name, email, role, password }) {
  const existing = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  if (existing.rowCount > 0) return existing.rows[0].id;
  const passwordHash = await hashPassword(password);
  const created = await pool.query(
    "INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
    [name, email, role, passwordHash]
  );
  return created.rows[0].id;
}

async function findOrCreateUser({ name, email, role, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await pool.query("SELECT id, role FROM users WHERE email = $1 LIMIT 1", [normalizedEmail]);
  if (existing.rowCount > 0) {
    if (existing.rows[0].role !== role) throw new Error(`Email ${normalizedEmail} already exists with different role.`);
    return existing.rows[0].id;
  }
  if (!password) throw new Error(`Password required for new ${role}: ${normalizedEmail}`);
  const passwordHash = await hashPassword(password);
  const created = await pool.query(
    "INSERT INTO users (name, email, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id",
    [String(name || normalizedEmail).trim(), normalizedEmail, role, passwordHash]
  );
  return created.rows[0].id;
}

async function upsertAssignment({ assigneeUserId, reviewerUserId, reviewYear, dueDate, createdBy }) {
  const result = await pool.query(
    `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
     VALUES ($1,$2,$3,$4,'assigned',$5)
     ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
     RETURNING id`,
    [assigneeUserId, reviewerUserId, reviewYear, dueDate, createdBy]
  );
  return result.rowCount > 0;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
  await pool.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','manager','teamlead','employee'))");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_assignments (
      id SERIAL PRIMARY KEY,
      assignee_user_id INTEGER NOT NULL REFERENCES users(id),
      reviewer_user_id INTEGER NOT NULL REFERENCES users(id),
      review_year INTEGER NOT NULL,
      due_date DATE,
      reviewer_feedback_visible BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','self_submitted','reviewer_submitted','closed')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS assignee_user_id INTEGER REFERENCES users(id)");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS reviewer_user_id INTEGER REFERENCES users(id)");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS review_year INTEGER");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS due_date DATE");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS reviewer_feedback_visible BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'assigned'");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id)");
  await pool.query("ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'review_assignments' AND column_name = 'employee_user_id'
      ) THEN
        EXECUTE 'ALTER TABLE review_assignments ALTER COLUMN employee_user_id DROP NOT NULL';
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'review_assignments' AND column_name = 'manager_user_id'
      ) THEN
        EXECUTE 'ALTER TABLE review_assignments ALTER COLUMN manager_user_id DROP NOT NULL';
      END IF;
    END $$;
  `);
  await pool.query("UPDATE review_assignments SET assignee_user_id = employee_user_id WHERE assignee_user_id IS NULL AND employee_user_id IS NOT NULL");
  await pool.query("UPDATE review_assignments SET reviewer_user_id = manager_user_id WHERE reviewer_user_id IS NULL AND manager_user_id IS NOT NULL");
  await pool.query("UPDATE review_assignments SET review_year = EXTRACT(YEAR FROM CURRENT_DATE)::INT WHERE review_year IS NULL");
  await pool.query("UPDATE review_assignments SET created_by = reviewer_user_id WHERE created_by IS NULL AND reviewer_user_id IS NOT NULL");
  await pool.query("DELETE FROM review_assignments WHERE assignee_user_id IS NULL OR reviewer_user_id IS NULL OR review_year IS NULL OR created_by IS NULL");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS uniq_assignment_per_year ON review_assignments (assignee_user_id, reviewer_user_id, review_year)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS self_reviews (
      id SERIAL PRIMARY KEY,
      assignment_id INTEGER UNIQUE NOT NULL REFERENCES review_assignments(id),
      assignee_user_id INTEGER NOT NULL REFERENCES users(id),
      overall_rating INTEGER NOT NULL CHECK(overall_rating >= 1 AND overall_rating <= 5),
      payload JSONB NOT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE self_reviews ADD COLUMN IF NOT EXISTS assignee_user_id INTEGER REFERENCES users(id)");
  await pool.query("UPDATE self_reviews sr SET assignee_user_id = ra.assignee_user_id FROM review_assignments ra WHERE sr.assignee_user_id IS NULL AND sr.assignment_id = ra.id");
  await pool.query("DELETE FROM self_reviews WHERE assignee_user_id IS NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviewer_reviews (
      id SERIAL PRIMARY KEY,
      assignment_id INTEGER UNIQUE NOT NULL REFERENCES review_assignments(id),
      reviewer_user_id INTEGER NOT NULL REFERENCES users(id),
      overall_rating INTEGER NOT NULL CHECK(overall_rating >= 1 AND overall_rating <= 5),
      payload JSONB NOT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE reviewer_reviews ADD COLUMN IF NOT EXISTS reviewer_user_id INTEGER REFERENCES users(id)");
  await pool.query("UPDATE reviewer_reviews rr SET reviewer_user_id = ra.reviewer_user_id FROM review_assignments ra WHERE rr.reviewer_user_id IS NULL AND rr.assignment_id = ra.id");
  await pool.query("DELETE FROM reviewer_reviews WHERE reviewer_user_id IS NULL");

  await seedUser({ name: "System Admin", email: ADMIN_EMAIL, role: "admin", password: ADMIN_PASSWORD });
  const managerId = await seedUser({ name: "Chinmay Modak", email: MANAGER_EMAIL, role: "manager", password: MANAGER_PASSWORD });
  const teamLeadId = await seedUser({ name: "Team Lead One", email: TEAMLEAD_EMAIL, role: "teamlead", password: TEAMLEAD_PASSWORD });
  const employeeId = await seedUser({ name: "Akash Mittal", email: EMPLOYEE_EMAIL, role: "employee", password: EMPLOYEE_PASSWORD });

  await pool.query(
    `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
     SELECT $1,$2,EXTRACT(YEAR FROM CURRENT_DATE)::INT,CURRENT_DATE + INTERVAL '15 day','assigned',$2
     WHERE NOT EXISTS (
       SELECT 1 FROM review_assignments
       WHERE assignee_user_id = $1 AND reviewer_user_id = $2 AND review_year = EXTRACT(YEAR FROM CURRENT_DATE)::INT
     )`,
    [employeeId, teamLeadId]
  );

  await pool.query(
    `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
     SELECT $1,$2,EXTRACT(YEAR FROM CURRENT_DATE)::INT,CURRENT_DATE + INTERVAL '20 day','assigned',$2
     WHERE NOT EXISTS (
       SELECT 1 FROM review_assignments
       WHERE assignee_user_id = $1 AND reviewer_user_id = $2 AND review_year = EXTRACT(YEAR FROM CURRENT_DATE)::INT
     )`,
    [teamLeadId, managerId]
  );
}

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  try {
    const u = await pool.query("SELECT id, name, email, role, password_hash FROM users WHERE email = $1 LIMIT 1", [String(email).trim().toLowerCase()]);
    if (u.rowCount === 0) return res.status(401).json({ error: "Invalid credentials." });
    const user = u.rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials." });
    const token = issueToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch {
    return res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/admin/users", auth, requireRole("admin"), async (_req, res) => {
  const users = await pool.query("SELECT id, name, email, role FROM users ORDER BY role, name");
  return res.json(users.rows);
});

async function validateHierarchy(reviewerUserId, assigneeUserId) {
  const rows = await pool.query("SELECT id, role FROM users WHERE id IN ($1,$2)", [reviewerUserId, assigneeUserId]);
  if (rows.rowCount !== 2) return "Invalid users.";
  const reviewer = rows.rows.find(r => r.id === Number(reviewerUserId));
  const assignee = rows.rows.find(r => r.id === Number(assigneeUserId));
  if (!reviewer || !assignee) return "Invalid users.";
  if (reviewer.role === "admin" && assignee.role === "manager") return null;
  if (reviewer.role === "teamlead" && assignee.role !== "employee") return "Team Lead can assign only to Employee.";
  if (reviewer.role === "manager" && assignee.role !== "teamlead") return "Manager can assign only to Team Lead.";
  if (!["admin", "teamlead", "manager"].includes(reviewer.role)) return "Reviewer must be Admin, Team Lead or Manager.";
  return null;
}

app.post("/api/admin/assignments", auth, requireRole("admin"), async (req, res) => {
  const { assigneeUserId, reviewerUserId, reviewYear, dueDate } = req.body;
  if (!assigneeUserId || !reviewerUserId || !reviewYear || !dueDate) return res.status(400).json({ error: "assigneeUserId, reviewerUserId, reviewYear, dueDate required." });
  const hierarchyErr = await validateHierarchy(Number(reviewerUserId), Number(assigneeUserId));
  if (hierarchyErr) return res.status(400).json({ error: hierarchyErr });
  try {
    const created = await pool.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       RETURNING id`,
      [assigneeUserId, reviewerUserId, reviewYear, dueDate, req.user.id]
    );
    return res.status(201).json({ message: "Review assigned.", id: created.rows[0].id });
  } catch {
    return res.status(500).json({ error: "Failed to assign review." });
  }
});

app.post("/api/admin/assignments/bulk", auth, requireRole("admin"), async (req, res) => {
  const { reviewYear, dueDate, copyFromYear } = req.body;
  const year = Number(reviewYear);
  const sourceYear = copyFromYear ? Number(copyFromYear) : null;
  if (!year || !dueDate) return res.status(400).json({ error: "reviewYear and dueDate are required." });

  try {
    const sourceYearRow = sourceYear
      ? { rows: [{ y: sourceYear }] }
      : await pool.query("SELECT MAX(review_year) AS y FROM review_assignments");
    const resolvedSourceYear = Number(sourceYearRow.rows[0]?.y);
    if (!resolvedSourceYear) return res.status(400).json({ error: "No existing assignments found to copy mapping from." });

    const pairs = await pool.query(
      `SELECT DISTINCT ra.reviewer_user_id, ra.assignee_user_id
       FROM review_assignments ra
       JOIN users r ON r.id = ra.reviewer_user_id
       JOIN users a ON a.id = ra.assignee_user_id
       WHERE ra.review_year = $1
         AND (
           (r.role = 'admin' AND a.role = 'manager') OR
           (r.role = 'manager' AND a.role = 'teamlead') OR
           (r.role = 'teamlead' AND a.role = 'employee')
         )`,
      [resolvedSourceYear]
    );

    if (pairs.rowCount === 0) return res.status(400).json({ error: "No valid hierarchy pairs found in source year." });

    let created = 0;
    let skipped = 0;
    for (const p of pairs.rows) {
      const result = await pool.query(
        `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
         VALUES ($1,$2,$3,$4,'assigned',$5)
         ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
         RETURNING id`,
        [p.assignee_user_id, p.reviewer_user_id, year, dueDate, req.user.id]
      );
      if (result.rowCount > 0) created += 1;
      else skipped += 1;
    }

    return res.json({
      message: "Bulk assignment completed.",
      sourceYear: resolvedSourceYear,
      targetYear: year,
      created,
      skipped
    });
  } catch {
    return res.status(500).json({ error: "Bulk assignment failed." });
  }
});

app.post("/api/admin/new-joiner", auth, requireRole("admin"), async (req, res) => {
  const {
    employeeName, employeeEmail, employeePassword,
    teamleadUserId, managerUserId,
    reviewYear, dueDate
  } = req.body;

  if (!employeeName || !employeeEmail || !employeePassword || !teamleadUserId || !managerUserId || !reviewYear || !dueDate) {
    return res.status(400).json({ error: "All joiner fields are required." });
  }

  const year = Number(reviewYear);
  if (!year) return res.status(400).json({ error: "Invalid review year." });

  try {
    const pairCheck = await pool.query(
      `SELECT m.id AS manager_id, t.id AS teamlead_id
       FROM users m, users t
       WHERE m.id = $1 AND m.role = 'manager'
         AND t.id = $2 AND t.role = 'teamlead'`,
      [Number(managerUserId), Number(teamleadUserId)]
    );
    if (pairCheck.rowCount === 0) return res.status(400).json({ error: "Invalid manager/team lead selection." });

    const adminRow = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    const adminId = adminRow.rows[0]?.id || req.user.id;
    const managerId = Number(managerUserId);
    const teamleadId = Number(teamleadUserId);
    const employeeId = await seedUser({
      name: String(employeeName).trim(),
      email: String(employeeEmail).trim().toLowerCase(),
      role: "employee",
      password: String(employeePassword)
    });

    let created = 0;
    if (await upsertAssignment({ assigneeUserId: managerId, reviewerUserId: adminId, reviewYear: year, dueDate, createdBy: req.user.id })) created += 1;
    if (await upsertAssignment({ assigneeUserId: teamleadId, reviewerUserId: managerId, reviewYear: year, dueDate, createdBy: req.user.id })) created += 1;
    if (await upsertAssignment({ assigneeUserId: employeeId, reviewerUserId: teamleadId, reviewYear: year, dueDate, createdBy: req.user.id })) created += 1;

    return res.json({ message: "New joiner hierarchy added.", created });
  } catch {
    return res.status(500).json({ error: "Failed to add new joiner." });
  }
});

app.post("/api/admin/bulk-onboard", auth, requireRole("admin"), async (req, res) => {
  const { entries, reviewYear, dueDate } = req.body;
  const year = Number(reviewYear);
  if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: "entries must be a non-empty array." });
  if (!year || !dueDate) return res.status(400).json({ error: "reviewYear and dueDate are required." });

  try {
    const adminRow = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    const adminId = adminRow.rows[0]?.id || req.user.id;

    let usersCreated = 0;
    let assignmentsCreated = 0;
    const errors = [];

    for (let i = 0; i < entries.length; i += 1) {
      const row = entries[i] || {};
      try {
        const managerExisting = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [String(row.managerEmail || "").trim().toLowerCase()]);
        const teamleadExisting = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [String(row.teamleadEmail || "").trim().toLowerCase()]);
        const employeeExisting = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [String(row.employeeEmail || "").trim().toLowerCase()]);

        const managerId = await findOrCreateUser({
          name: row.managerName,
          email: row.managerEmail,
          role: "manager",
          password: row.managerPassword
        });
        const teamleadId = await findOrCreateUser({
          name: row.teamleadName,
          email: row.teamleadEmail,
          role: "teamlead",
          password: row.teamleadPassword
        });
        const employeeId = await findOrCreateUser({
          name: row.employeeName,
          email: row.employeeEmail,
          role: "employee",
          password: row.employeePassword
        });

        if (managerExisting.rowCount === 0) usersCreated += 1;
        if (teamleadExisting.rowCount === 0) usersCreated += 1;
        if (employeeExisting.rowCount === 0) usersCreated += 1;

        if (await upsertAssignment({ assigneeUserId: managerId, reviewerUserId: adminId, reviewYear: year, dueDate, createdBy: req.user.id })) assignmentsCreated += 1;
        if (await upsertAssignment({ assigneeUserId: teamleadId, reviewerUserId: managerId, reviewYear: year, dueDate, createdBy: req.user.id })) assignmentsCreated += 1;
        if (await upsertAssignment({ assigneeUserId: employeeId, reviewerUserId: teamleadId, reviewYear: year, dueDate, createdBy: req.user.id })) assignmentsCreated += 1;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message || "Row processing failed." });
      }
    }

    return res.json({
      message: "Bulk onboard completed.",
      totalRows: entries.length,
      usersCreated,
      assignmentsCreated,
      failedRows: errors.length,
      errors
    });
  } catch {
    return res.status(500).json({ error: "Bulk onboard failed." });
  }
});

app.post("/api/admin/promote-employee", auth, requireRole("admin"), async (req, res) => {
  const { employeeUserId, managerUserId, reviewYear, dueDate, cleanupPending = true } = req.body;
  const employeeId = Number(employeeUserId);
  const managerId = Number(managerUserId);
  const year = Number(reviewYear);
  if (!employeeId || !managerId || !year || !dueDate) {
    return res.status(400).json({ error: "employeeUserId, managerUserId, reviewYear, dueDate are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const employee = await client.query("SELECT id, role FROM users WHERE id = $1 FOR UPDATE", [employeeId]);
    const manager = await client.query("SELECT id, role FROM users WHERE id = $1", [managerId]);
    const adminRow = await client.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    const adminId = adminRow.rows[0]?.id || req.user.id;

    if (employee.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Employee user not found." });
    }
    if (manager.rowCount === 0 || manager.rows[0].role !== "manager") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Selected manager is invalid." });
    }
    if (!["employee", "teamlead"].includes(employee.rows[0].role)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only employee or existing teamlead can be processed." });
    }

    await client.query("UPDATE users SET role = 'teamlead' WHERE id = $1", [employeeId]);

    let cleaned = 0;
    if (cleanupPending) {
      const cleanupResult = await client.query(
        `DELETE FROM review_assignments
         WHERE assignee_user_id = $1
           AND status IN ('assigned','self_submitted')`,
        [employeeId]
      );
      cleaned = cleanupResult.rowCount;
    }

    let created = 0;
    const a1 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [managerId, adminId, year, dueDate, req.user.id]
    );
    if (a1.rowCount > 0) created += 1;

    const a2 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [employeeId, managerId, year, dueDate, req.user.id]
    );
    if (a2.rowCount > 0) created += 1;

    await client.query("COMMIT");
    return res.json({
      message: "Employee promoted to Team Lead and hierarchy updated.",
      assignmentsCreated: created,
      pendingAssignmentsCleaned: cleaned
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to promote employee." });
  } finally {
    client.release();
  }
});

app.post("/api/admin/promote-teamlead", auth, requireRole("admin"), async (req, res) => {
  const { teamleadUserId, reviewYear, dueDate, cleanupPending = true } = req.body;
  const leadId = Number(teamleadUserId);
  const year = Number(reviewYear);
  if (!leadId || !year || !dueDate) return res.status(400).json({ error: "teamleadUserId, reviewYear, dueDate are required." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lead = await client.query("SELECT id, role FROM users WHERE id = $1 FOR UPDATE", [leadId]);
    if (lead.rowCount === 0 || !["teamlead", "manager"].includes(lead.rows[0].role)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Selected user is not a Team Lead." });
    }

    await client.query("UPDATE users SET role = 'manager' WHERE id = $1", [leadId]);

    let cleaned = 0;
    if (cleanupPending) {
      const del = await client.query(
        `DELETE FROM review_assignments
         WHERE assignee_user_id = $1
           AND status IN ('assigned','self_submitted')`,
        [leadId]
      );
      cleaned = del.rowCount;
    }

    await client.query("COMMIT");
    return res.json({ message: "Team Lead promoted to Manager.", pendingAssignmentsCleaned: cleaned });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to promote team lead." });
  } finally {
    client.release();
  }
});

app.post("/api/admin/reassign-teamlead-manager", auth, requireRole("admin"), async (req, res) => {
  const { teamleadUserId, newManagerUserId, reviewYear, dueDate, cleanupPending = true } = req.body;
  const teamleadId = Number(teamleadUserId);
  const managerId = Number(newManagerUserId);
  const year = Number(reviewYear);
  if (!teamleadId || !managerId || !year || !dueDate) {
    return res.status(400).json({ error: "teamleadUserId, newManagerUserId, reviewYear, dueDate are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pair = await client.query(
      `SELECT
         (SELECT role FROM users WHERE id = $1) AS lead_role,
         (SELECT role FROM users WHERE id = $2) AS manager_role`,
      [teamleadId, managerId]
    );
    if (pair.rows[0]?.lead_role !== "teamlead" || pair.rows[0]?.manager_role !== "manager") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid team lead/manager selection." });
    }

    const adminRow = await client.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    const adminId = adminRow.rows[0]?.id || req.user.id;

    let cleaned = 0;
    if (cleanupPending) {
      const old = await client.query(
        `DELETE FROM review_assignments
         WHERE assignee_user_id = $1
           AND reviewer_user_id IN (SELECT id FROM users WHERE role = 'manager' AND id <> $2)
           AND status IN ('assigned','self_submitted')`,
        [teamleadId, managerId]
      );
      cleaned = old.rowCount;
    }

    const a1 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [managerId, adminId, year, dueDate, req.user.id]
    );
    const a2 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [teamleadId, managerId, year, dueDate, req.user.id]
    );

    await client.query("COMMIT");
    return res.json({
      message: "Team Lead reassigned to new Manager.",
      assignmentsCreated: (a1.rowCount > 0 ? 1 : 0) + (a2.rowCount > 0 ? 1 : 0),
      pendingAssignmentsCleaned: cleaned
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to reassign team lead." });
  } finally {
    client.release();
  }
});

app.post("/api/admin/reassign-employee-lead", auth, requireRole("admin"), async (req, res) => {
  const { employeeUserId, newTeamleadUserId, reviewYear, dueDate, cleanupPending = true } = req.body;
  const employeeId = Number(employeeUserId);
  const leadId = Number(newTeamleadUserId);
  const year = Number(reviewYear);
  if (!employeeId || !leadId || !year || !dueDate) {
    return res.status(400).json({ error: "employeeUserId, newTeamleadUserId, reviewYear, dueDate are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pair = await client.query(
      `SELECT
         (SELECT role FROM users WHERE id = $1) AS employee_role,
         (SELECT role FROM users WHERE id = $2) AS lead_role`,
      [employeeId, leadId]
    );
    if (pair.rows[0]?.employee_role !== "employee" || pair.rows[0]?.lead_role !== "teamlead") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid employee/team lead selection." });
    }

    const managerRow = await client.query(
      `SELECT reviewer_user_id AS manager_id
       FROM review_assignments ra
       JOIN users u ON u.id = ra.reviewer_user_id
       WHERE ra.assignee_user_id = $1 AND u.role = 'manager'
       ORDER BY ra.created_at DESC
       LIMIT 1`,
      [leadId]
    );
    if (managerRow.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Selected team lead is not mapped under any manager yet." });
    }

    const managerId = managerRow.rows[0].manager_id;
    const adminRow = await client.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    const adminId = adminRow.rows[0]?.id || req.user.id;

    let cleaned = 0;
    if (cleanupPending) {
      const old = await client.query(
        `DELETE FROM review_assignments
         WHERE assignee_user_id = $1
           AND reviewer_user_id IN (SELECT id FROM users WHERE role = 'teamlead' AND id <> $2)
           AND status IN ('assigned','self_submitted')`,
        [employeeId, leadId]
      );
      cleaned = old.rowCount;
    }

    const a1 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [managerId, adminId, year, dueDate, req.user.id]
    );
    const a2 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [leadId, managerId, year, dueDate, req.user.id]
    );
    const a3 = await client.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$5)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [employeeId, leadId, year, dueDate, req.user.id]
    );

    await client.query("COMMIT");
    return res.json({
      message: "Employee moved to new Team Lead and hierarchy synced.",
      assignmentsCreated: (a1.rowCount > 0 ? 1 : 0) + (a2.rowCount > 0 ? 1 : 0) + (a3.rowCount > 0 ? 1 : 0),
      pendingAssignmentsCleaned: cleaned
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to move employee." });
  } finally {
    client.release();
  }
});

app.get("/api/admin/overview", auth, requireRole("admin"), async (_req, res) => {
  const rows = await pool.query(`
    SELECT ra.id, ra.review_year, ra.status, ra.created_at, ra.due_date, ra.reviewer_feedback_visible,
           a.name AS assignee_name, a.email AS assignee_email, a.role AS assignee_role,
           r.name AS reviewer_name, r.email AS reviewer_email, r.role AS reviewer_role,
           sr.overall_rating AS self_overall_rating, sr.payload AS self_payload, sr.submitted_at AS self_submitted_at,
           rr.overall_rating AS reviewer_overall_rating, rr.payload AS reviewer_payload, rr.submitted_at AS reviewer_submitted_at
    FROM review_assignments ra
    JOIN users a ON a.id = ra.assignee_user_id
    JOIN users r ON r.id = ra.reviewer_user_id
    LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
    LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
    ORDER BY r.name, ra.created_at DESC
  `);
  return res.json(rows.rows);
});

app.post("/api/admin/assignments/:id/share-review", auth, requireRole("admin"), async (req, res) => {
  const assignmentId = Number(req.params.id);
  if (!assignmentId) return res.status(400).json({ error: "Invalid assignment id." });
  const check = await pool.query("SELECT 1 FROM reviewer_reviews WHERE assignment_id = $1", [assignmentId]);
  if (check.rowCount === 0) return res.status(409).json({ error: "Reviewer review not submitted yet." });
  await pool.query("UPDATE review_assignments SET reviewer_feedback_visible = TRUE WHERE id = $1", [assignmentId]);
  return res.json({ message: "Reviewer feedback shared with assignee." });
});

app.get("/api/manager/teamleads", auth, requireRole("manager"), async (_req, res) => {
  const rows = await pool.query("SELECT id, name, email FROM users WHERE role = 'teamlead' ORDER BY name");
  return res.json(rows.rows);
});

app.get("/api/teamlead/employees", auth, requireRole("teamlead"), async (_req, res) => {
  const rows = await pool.query("SELECT id, name, email FROM users WHERE role = 'employee' ORDER BY name");
  return res.json(rows.rows);
});

async function createAssignmentByReviewer(req, res, assigneeRole) {
  const { assigneeUserId, reviewYear, dueDate } = req.body;
  if (!assigneeUserId || !reviewYear || !dueDate) return res.status(400).json({ error: "assigneeUserId, reviewYear, dueDate required." });
  const hierarchyErr = await validateHierarchy(req.user.id, Number(assigneeUserId));
  if (hierarchyErr) return res.status(400).json({ error: hierarchyErr });

  try {
    const created = await pool.query(
      `INSERT INTO review_assignments (assignee_user_id, reviewer_user_id, review_year, due_date, status, created_by)
       VALUES ($1,$2,$3,$4,'assigned',$2)
       ON CONFLICT (assignee_user_id, reviewer_user_id, review_year) DO NOTHING
       RETURNING id`,
      [assigneeUserId, req.user.id, Number(reviewYear), dueDate]
    );
    if (created.rowCount === 0) return res.status(409).json({ error: "Review already assigned for this year." });
    return res.status(201).json({ message: "Review assigned.", id: created.rows[0].id });
  } catch {
    return res.status(500).json({ error: "Failed to assign review." });
  }
}

app.post("/api/manager/assignments", auth, requireRole("manager"), async (req, res) => createAssignmentByReviewer(req, res, "teamlead"));
app.post("/api/teamlead/assignments", auth, requireRole("teamlead"), async (req, res) => createAssignmentByReviewer(req, res, "employee"));

app.get("/api/manager/assignments", auth, requireRole("manager"), async (req, res) => {
  const rows = await pool.query(
    `SELECT ra.id, ra.review_year, ra.status, ra.created_at, ra.due_date,
            a.name AS assignee_name, a.email AS assignee_email,
            (sr.id IS NOT NULL) AS self_submitted, (rr.id IS NOT NULL) AS reviewer_submitted
     FROM review_assignments ra
     JOIN users a ON a.id = ra.assignee_user_id
     LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
     LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
     WHERE ra.reviewer_user_id = $1 AND a.role = 'teamlead'
     ORDER BY ra.created_at DESC`,
    [req.user.id]
  );
  return res.json(rows.rows);
});

app.get("/api/teamlead/assignments", auth, requireRole("teamlead"), async (req, res) => {
  const rows = await pool.query(
    `SELECT ra.id, ra.review_year, ra.status, ra.created_at, ra.due_date,
            a.name AS assignee_name, a.email AS assignee_email,
            (sr.id IS NOT NULL) AS self_submitted, sr.payload AS self_payload,
            (rr.id IS NOT NULL) AS reviewer_submitted, rr.payload AS reviewer_payload
     FROM review_assignments ra
     JOIN users a ON a.id = ra.assignee_user_id
     LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
     LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
     WHERE ra.reviewer_user_id = $1 AND a.role = 'employee'
     ORDER BY ra.created_at DESC`,
    [req.user.id]
  );
  return res.json(rows.rows);
});

app.get("/api/manager/hierarchy-overview", auth, requireRole("manager"), async (req, res) => {
  try {
    const teamLeads = await pool.query(
      `SELECT ra.id, ra.review_year, ra.status, ra.due_date,
              a.id AS teamlead_id, a.name AS teamlead_name, a.email AS teamlead_email,
              sr.payload AS self_payload, rr.payload AS reviewer_payload
       FROM review_assignments ra
       JOIN users a ON a.id = ra.assignee_user_id
       LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
       LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
       WHERE ra.reviewer_user_id = $1 AND a.role = 'teamlead'
       ORDER BY ra.created_at DESC`,
      [req.user.id]
    );

    const employees = await pool.query(
      `SELECT ra.id, ra.review_year, ra.status, ra.due_date,
              e.name AS employee_name, e.email AS employee_email,
              tl.id AS teamlead_id, tl.name AS teamlead_name, tl.email AS teamlead_email,
              sr.payload AS self_payload, rr.payload AS reviewer_payload
       FROM review_assignments ra
       JOIN users e ON e.id = ra.assignee_user_id
       JOIN users tl ON tl.id = ra.reviewer_user_id
       LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
       LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
       WHERE e.role = 'employee'
         AND tl.role = 'teamlead'
         AND tl.id IN (
           SELECT assignee_user_id FROM review_assignments
           WHERE reviewer_user_id = $1
         )
       ORDER BY tl.name, ra.created_at DESC`,
      [req.user.id]
    );

    return res.json({ teamLeads: teamLeads.rows, employees: employees.rows });
  } catch {
    return res.status(500).json({ error: "Failed to load hierarchy overview." });
  }
});

app.delete("/api/reviewer/assignments/:id", auth, requireRole("manager", "teamlead"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid assignment id." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const own = await client.query("SELECT id, status FROM review_assignments WHERE id = $1 AND reviewer_user_id = $2", [id, req.user.id]);
    if (own.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Assignment not found." });
    }
    if (["reviewer_submitted", "closed"].includes(own.rows[0].status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Cannot delete a closed assignment." });
    }
    await client.query("DELETE FROM self_reviews WHERE assignment_id = $1", [id]);
    await client.query("DELETE FROM reviewer_reviews WHERE assignment_id = $1", [id]);
    await client.query("DELETE FROM review_assignments WHERE id = $1", [id]);
    await client.query("COMMIT");
    return res.json({ message: "Assignment deleted." });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to delete assignment." });
  } finally {
    client.release();
  }
});

app.get("/api/self/assignments", auth, requireRole("employee", "teamlead", "manager"), async (req, res) => {
  const rows = await pool.query(
    `SELECT ra.id, ra.review_year, ra.status, ra.created_at, ra.due_date, ra.reviewer_feedback_visible,
            r.name AS reviewer_name, r.role AS reviewer_role,
            (sr.id IS NOT NULL) AS self_submitted, (rr.id IS NOT NULL) AS reviewer_submitted
     FROM review_assignments ra
     JOIN users r ON r.id = ra.reviewer_user_id
     LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
     LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
     WHERE ra.assignee_user_id = $1
     ORDER BY ra.created_at DESC`,
    [req.user.id]
  );
  return res.json(rows.rows);
});

app.post("/api/self/review", auth, requireRole("employee", "teamlead", "manager"), async (req, res) => {
  const { assignmentId, overallRating, payload } = req.body;
  if (!assignmentId || !overallRating || !payload) return res.status(400).json({ error: "assignmentId, overallRating, payload required." });
  if (!isRating1to5(overallRating)) return res.status(400).json({ error: "Overall rating must be between 1 and 5." });
  for (const key of ratingKeysSelf) if (!isRating1to5(payload[key])) return res.status(400).json({ error: `Invalid rating for ${key}.` });
  for (const key of requiredSelfTextKeys) if (!payload[key] || !String(payload[key]).trim()) return res.status(400).json({ error: `Missing required field: ${key}` });

  const a = await pool.query("SELECT * FROM review_assignments WHERE id = $1 AND assignee_user_id = $2", [assignmentId, req.user.id]);
  if (a.rowCount === 0) return res.status(403).json({ error: "Assignment not found." });
  if (["reviewer_submitted", "closed"].includes(a.rows[0].status)) return res.status(409).json({ error: "This review is closed." });

  await pool.query(
    `INSERT INTO self_reviews (assignment_id, assignee_user_id, overall_rating, payload)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (assignment_id) DO UPDATE SET overall_rating = EXCLUDED.overall_rating, payload = EXCLUDED.payload, submitted_at = CURRENT_TIMESTAMP`,
    [assignmentId, req.user.id, Number(overallRating), payload]
  );
  await pool.query("UPDATE review_assignments SET status = 'self_submitted' WHERE id = $1 AND status = 'assigned'", [assignmentId]);
  return res.json({ message: "Self review submitted." });
});

app.post("/api/reviewer/review", auth, requireRole("teamlead", "manager"), async (req, res) => {
  const { assignmentId, overallRating, payload } = req.body;
  if (!assignmentId || !overallRating || !payload) return res.status(400).json({ error: "assignmentId, overallRating, payload required." });
  if (!isRating1to5(overallRating)) return res.status(400).json({ error: "Overall rating must be between 1 and 5." });
  for (const key of ratingKeysReviewer) if (!isRating1to5(payload[key])) return res.status(400).json({ error: `Invalid rating for ${key}.` });
  for (const key of requiredReviewerTextKeys) if (!payload[key] || !String(payload[key]).trim()) return res.status(400).json({ error: `Missing required field: ${key}` });

  const a = await pool.query("SELECT * FROM review_assignments WHERE id = $1 AND reviewer_user_id = $2", [assignmentId, req.user.id]);
  if (a.rowCount === 0) return res.status(403).json({ error: "Assignment not found." });
  if (["reviewer_submitted", "closed"].includes(a.rows[0].status)) return res.status(409).json({ error: "This review is already locked." });

  await pool.query(
    `INSERT INTO reviewer_reviews (assignment_id, reviewer_user_id, overall_rating, payload)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (assignment_id) DO UPDATE SET overall_rating = EXCLUDED.overall_rating, payload = EXCLUDED.payload, submitted_at = CURRENT_TIMESTAMP`,
    [assignmentId, req.user.id, Number(overallRating), payload]
  );
  await pool.query("UPDATE review_assignments SET status = 'closed' WHERE id = $1", [assignmentId]);
  return res.json({ message: "Reviewer review submitted and locked." });
});

app.get("/api/self/reviewer-feedback/:assignmentId", auth, requireRole("employee", "teamlead", "manager"), async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: "Invalid assignment id." });
  const row = await pool.query(
    `SELECT ra.id, ra.reviewer_feedback_visible, rr.overall_rating, rr.payload, rr.submitted_at
     FROM review_assignments ra
     LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
     WHERE ra.id = $1 AND ra.assignee_user_id = $2`,
    [assignmentId, req.user.id]
  );
  if (row.rowCount === 0) return res.status(404).json({ error: "Assignment not found." });
  if (!row.rows[0].reviewer_feedback_visible) return res.status(403).json({ error: "Reviewer feedback not shared by admin." });
  if (!row.rows[0].payload) return res.status(404).json({ error: "Reviewer feedback not submitted yet." });
  return res.json(row.rows[0]);
});

app.get("/api/reviews/download-docx", auth, requireRole("admin", "manager"), async (req, res) => {
  const result = await pool.query(`
    SELECT ra.id, ra.review_year, ra.status, ra.due_date,
           a.name AS assignee_name, a.role AS assignee_role,
           r.name AS reviewer_name, r.role AS reviewer_role,
           sr.overall_rating AS self_overall_rating, sr.payload AS self_payload,
           rr.overall_rating AS reviewer_overall_rating, rr.payload AS reviewer_payload
    FROM review_assignments ra
    JOIN users a ON a.id = ra.assignee_user_id
    JOIN users r ON r.id = ra.reviewer_user_id
    LEFT JOIN self_reviews sr ON sr.assignment_id = ra.id
    LEFT JOIN reviewer_reviews rr ON rr.assignment_id = ra.id
    ORDER BY ra.created_at DESC
  `);

  const children = [
    new Paragraph({ text: "Performance Review Export", heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Generated On: ${new Date().toISOString().slice(0, 10)}` }),
    new Paragraph({ text: " " }),
  ];

  for (const row of result.rows) {
    children.push(new Paragraph({ text: `Assignment #${row.id}`, heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph(`Assignee: ${row.assignee_name} (${row.assignee_role})`));
    children.push(new Paragraph(`Reviewer: ${row.reviewer_name} (${row.reviewer_role})`));
    children.push(new Paragraph(`Year: ${row.review_year} | Due: ${row.due_date ? String(row.due_date).slice(0, 10) : "-"} | Status: ${row.status}`));
    children.push(new Paragraph(`Self Overall: ${row.self_overall_rating ?? "-"} / 5`));
    children.push(new Paragraph(`Reviewer Overall: ${row.reviewer_overall_rating ?? "-"} / 5`));
    if (row.self_payload) children.push(new Paragraph(`Self Payload: ${JSON.stringify(row.self_payload)}`));
    if (row.reviewer_payload) children.push(new Paragraph(`Reviewer Payload: ${JSON.stringify(row.reviewer_payload)}`));
    children.push(new Paragraph(" "));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="reviews-${Date.now()}.docx"`);
  return res.send(buffer);
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Feedback app running on http://localhost:${PORT}`);
      console.log(`Seed login employee: ${EMPLOYEE_EMAIL}`);
      console.log(`Seed login teamlead: ${TEAMLEAD_EMAIL}`);
      console.log(`Seed login manager: ${MANAGER_EMAIL}`);
      console.log(`Seed login admin: ${ADMIN_EMAIL}`);
    });
  })
  .catch((e) => {
    console.error("Database connection failed. Check DATABASE_URL in backend/.env", e);
    process.exit(1);
  });

import { API_BASE, api, clearSession, requireRole } from "./auth.js";

requireRole("admin");
const assigneeSelect = document.getElementById("employeeSelect");
const reviewerSelect = document.getElementById("managerSelect");
const reviewYear = document.getElementById("reviewYear");
const dueDate = document.getElementById("dueDate");
const assignStatus = document.getElementById("assignStatus");
const joinerStatus = document.getElementById("joinerStatus");
const joinerLeadSelect = document.getElementById("joinerLeadSelect");
const joinerManagerSelect = document.getElementById("joinerManagerSelect");
const bulkCsvFile = document.getElementById("bulkCsvFile");
const bulkOnboardStatus = document.getElementById("bulkOnboardStatus");
const promoteEmployeeSelect = document.getElementById("promoteEmployeeSelect");
const promoteManagerSelect = document.getElementById("promoteManagerSelect");
const promoteStatus = document.getElementById("promoteStatus");
const promoteLeadToManagerSelect = document.getElementById("promoteLeadToManagerSelect");
const reassignLeadManagerSelect = document.getElementById("reassignLeadManagerSelect");
const moveEmployeeSelect = document.getElementById("moveEmployeeSelect");
const moveLeadSelect = document.getElementById("moveLeadSelect");
const transferStatus = document.getElementById("transferStatus");
const overview = document.getElementById("overview");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };

document.getElementById("assignBtn").onclick = async () => {
  try {
    await api("/api/admin/assignments", { method: "POST", body: JSON.stringify({ assigneeUserId: Number(assigneeSelect.value), reviewerUserId: Number(reviewerSelect.value), reviewYear: Number(reviewYear.value), dueDate: dueDate.value }) });
    assignStatus.textContent = "Review allocated.";
    loadOverview();
  } catch (err) { assignStatus.textContent = err.message; }
};

document.getElementById("bulkAssignBtn").onclick = async () => {
  try {
    const data = await api("/api/admin/assignments/bulk", {
      method: "POST",
      body: JSON.stringify({
        reviewYear: Number(reviewYear.value),
        dueDate: dueDate.value
      })
    });
    assignStatus.textContent = `Bulk done: created ${data.created}, skipped ${data.skipped} (copied mapping from ${data.sourceYear}).`;
    await loadOverview();
  } catch (err) {
    assignStatus.textContent = err.message;
  }
};

document.getElementById("refreshBtn").onclick = () => loadOverview();
document.getElementById("addJoinerBtn").onclick = async () => {
  const payload = {
    employeeName: document.getElementById("joinerEmployeeName").value.trim(),
    employeeEmail: document.getElementById("joinerEmployeeEmail").value.trim(),
    employeePassword: document.getElementById("joinerEmployeePassword").value,
    teamleadUserId: Number(joinerLeadSelect.value),
    managerUserId: Number(joinerManagerSelect.value),
    reviewYear: Number(reviewYear.value),
    dueDate: dueDate.value
  };

  try {
    const data = await api("/api/admin/new-joiner", { method: "POST", body: JSON.stringify(payload) });
    joinerStatus.textContent = `Joiner added successfully. Created ${data.created} new assignment(s).`;
    await loadUsers();
    await loadOverview();
  } catch (err) {
    joinerStatus.textContent = err.message;
  }
};
document.getElementById("bulkOnboardBtn").onclick = async () => {
  try {
    const file = bulkCsvFile.files && bulkCsvFile.files[0];
    if (!file) {
      bulkOnboardStatus.textContent = "Please choose a CSV file.";
      return;
    }
    const csvText = await file.text();
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      bulkOnboardStatus.textContent = "CSV must contain header and at least one row.";
      return;
    }

    const entries = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split(",").map(v => v.trim());
      if (cols.length < 9) continue;
      entries.push({
        employeeName: cols[0],
        employeeEmail: cols[1],
        employeePassword: cols[2],
        teamleadName: cols[3],
        teamleadEmail: cols[4],
        teamleadPassword: cols[5],
        managerName: cols[6],
        managerEmail: cols[7],
        managerPassword: cols[8]
      });
    }

    if (entries.length === 0) {
      bulkOnboardStatus.textContent = "No valid rows found in CSV.";
      return;
    }

    const data = await api("/api/admin/bulk-onboard", {
      method: "POST",
      body: JSON.stringify({
        entries,
        reviewYear: Number(reviewYear.value),
        dueDate: dueDate.value
      })
    });

    bulkOnboardStatus.textContent = `Bulk done. Rows: ${data.totalRows}, Users created: ${data.usersCreated}, Assignments created: ${data.assignmentsCreated}, Failed rows: ${data.failedRows}.`;
    await loadUsers();
    await loadOverview();
  } catch (err) {
    bulkOnboardStatus.textContent = err.message;
  }
};
document.getElementById("downloadTemplateBtn").onclick = () => {
  const header = "employee_name,employee_email,employee_password,teamlead_name,teamlead_email,teamlead_password,manager_name,manager_email,manager_password";
  const sample1 = "Akash Mittal,akash@company.com,Employee@12345,Lead One,lead1@company.com,Lead@12345,Manager One,manager1@company.com,Manager@12345";
  const sample2 = "Riya Sharma,riya@company.com,Employee@12345,Lead One,lead1@company.com,Lead@12345,Manager One,manager1@company.com,Manager@12345";
  const csv = `${header}\n${sample1}\n${sample2}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk_employee_hierarchy_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
document.getElementById("promoteBtn").onclick = async () => {
  try {
    const data = await api("/api/admin/promote-employee", {
      method: "POST",
      body: JSON.stringify({
        employeeUserId: Number(promoteEmployeeSelect.value),
        managerUserId: Number(promoteManagerSelect.value),
        reviewYear: Number(reviewYear.value),
        dueDate: dueDate.value,
        cleanupPending: true
      })
    });
    promoteStatus.textContent = `Updated. Created ${data.assignmentsCreated} assignments and cleaned ${data.pendingAssignmentsCleaned} pending assignments.`;
    await loadUsers();
    await loadOverview();
  } catch (err) {
    promoteStatus.textContent = err.message;
  }
};
document.getElementById("promoteLeadBtn").onclick = async () => {
  try {
    const data = await api("/api/admin/promote-teamlead", {
      method: "POST",
      body: JSON.stringify({
        teamleadUserId: Number(promoteLeadToManagerSelect.value),
        reviewYear: Number(reviewYear.value),
        dueDate: dueDate.value,
        cleanupPending: true
      })
    });
    transferStatus.textContent = `Promoted Team Lead to Manager. Cleaned ${data.pendingAssignmentsCleaned} pending assignments.`;
    await loadUsers();
    await loadOverview();
  } catch (err) {
    transferStatus.textContent = err.message;
  }
};

document.getElementById("reassignLeadBtn").onclick = async () => {
  try {
    const data = await api("/api/admin/reassign-teamlead-manager", {
      method: "POST",
      body: JSON.stringify({
        teamleadUserId: Number(promoteLeadToManagerSelect.value),
        newManagerUserId: Number(reassignLeadManagerSelect.value),
        reviewYear: Number(reviewYear.value),
        dueDate: dueDate.value,
        cleanupPending: true
      })
    });
    transferStatus.textContent = `Team Lead reassigned. Created ${data.assignmentsCreated}, cleaned ${data.pendingAssignmentsCleaned}.`;
    await loadUsers();
    await loadOverview();
  } catch (err) {
    transferStatus.textContent = err.message;
  }
};

document.getElementById("moveEmployeeBtn").onclick = async () => {
  try {
    const data = await api("/api/admin/reassign-employee-lead", {
      method: "POST",
      body: JSON.stringify({
        employeeUserId: Number(moveEmployeeSelect.value),
        newTeamleadUserId: Number(moveLeadSelect.value),
        reviewYear: Number(reviewYear.value),
        dueDate: dueDate.value,
        cleanupPending: true
      })
    });
    transferStatus.textContent = `Employee moved. Created ${data.assignmentsCreated}, cleaned ${data.pendingAssignmentsCleaned}.`;
    await loadUsers();
    await loadOverview();
  } catch (err) {
    transferStatus.textContent = err.message;
  }
};

const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.onclick = async () => {
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`${API_BASE}/api/reviews/download-docx`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { assignStatus.textContent = "Download failed"; return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "all-reviews.docx";
    a.click();
    URL.revokeObjectURL(url);
  };
}

async function loadUsers() {
  const users = await api("/api/admin/users");
  const assignees = users.filter(u => ["employee", "teamlead", "manager"].includes(u.role));
  const reviewers = users.filter(u => ["admin", "teamlead", "manager"].includes(u.role));
  const leads = users.filter(u => u.role === "teamlead");
  const managers = users.filter(u => u.role === "manager");
  const employees = users.filter(u => u.role === "employee");
  assigneeSelect.innerHTML = assignees.map(u => `<option value="${u.id}">${u.name} (${u.role}) - ${u.email}</option>`).join("");
  reviewerSelect.innerHTML = reviewers.map(u => `<option value="${u.id}">${u.name} (${u.role}) - ${u.email}</option>`).join("");
  joinerLeadSelect.innerHTML = leads.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  joinerManagerSelect.innerHTML = managers.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  promoteEmployeeSelect.innerHTML = employees.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  promoteManagerSelect.innerHTML = managers.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  promoteLeadToManagerSelect.innerHTML = leads.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  reassignLeadManagerSelect.innerHTML = managers.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  moveEmployeeSelect.innerHTML = employees.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
  moveLeadSelect.innerHTML = leads.map(u => `<option value="${u.id}">${u.name} - ${u.email}</option>`).join("");
}

function renderSelf(row) {
  if (!row.self_payload) return "<div class='meta'>Assignee self review not submitted.</div>";
  const p = row.self_payload;
  return `<details class="inline-details"><summary>Assignee Filled Details</summary>
    <div class="meta"><strong>Overall:</strong> ${row.self_overall_rating ?? "-"} / 5</div>
    <div class="meta"><strong>Innovation:</strong> ${p.innovation ?? "-"} | <strong>Goal:</strong> ${p.goalAchievement ?? "-"} | <strong>Team Work:</strong> ${p.teamWork ?? "-"}</div>
    <div class="meta"><strong>Commitment:</strong> ${p.commitment ?? "-"} | <strong>Technical:</strong> ${p.technicalLearning ?? "-"} | <strong>Support:</strong> ${p.softwareSupport ?? "-"}</div>
    <div class="meta"><strong>Graphics:</strong> ${p.graphicsLearning ?? "-"} | <strong>Site:</strong> ${p.siteActivities ?? "-"} | <strong>Communication:</strong> ${p.communication ?? "-"}</div>
    <div class="meta"><strong>Problem Solving:</strong> ${p.problemSolving ?? "-"} | <strong>Time:</strong> ${p.timeManagement ?? "-"}</div>
    <div class="meta"><strong>Skills Learned:</strong> ${p.skillsLearned ?? "-"}</div>
    <div class="meta"><strong>Development Work:</strong> ${p.softwareHardware ?? "-"}</div>
    <div class="meta"><strong>Graphics Skills:</strong> ${p.graphicsSkills ?? "-"}</div>
    <div class="meta"><strong>Site Activities Summary:</strong> ${p.siteActivitiesSummary ?? "-"}</div>
    <div class="meta"><strong>Achievements:</strong> ${p.achievements ?? "-"}</div>
    <div class="meta"><strong>Challenges:</strong> ${p.challenges ?? "-"}</div>
    <div class="meta"><strong>Self Comments:</strong> ${p.selfComments ?? "-"}</div>
  </details>`;
}

function renderReviewer(row) {
  if (!row.reviewer_payload) return "<div class='meta'>Reviewer review not submitted.</div>";
  const p = row.reviewer_payload;
  return `<details class="inline-details"><summary>Reviewer Filled Details</summary><div class="meta"><strong>Overall:</strong> ${row.reviewer_overall_rating ?? "-"} / 5</div><div class="meta"><strong>Quality:</strong> ${p.quality ?? "-"} | <strong>Productivity:</strong> ${p.productivity ?? "-"} | <strong>Job Knowledge:</strong> ${p.jobKnowledge ?? "-"}</div><div class="meta"><strong>Final Comments:</strong> ${p.comments ?? "-"}</div></details>`;
}

async function loadOverview() {
  const items = await api("/api/admin/overview");
  overview.innerHTML = items.map(i => `
    <article class="feedback-item">
      <strong>${i.reviewer_name} (${i.reviewer_role})</strong>
      <div class="meta">Assignee: ${i.assignee_name} (${i.assignee_role}) | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Status: ${i.status}</div>
      <div class="row-actions">
        <button type="button" class="show-review-btn" data-id="${i.id}" ${i.reviewer_payload ? "" : "disabled"}>${i.reviewer_payload ? "Show Reviewer Review" : "Reviewer Pending"}</button>
        <button type="button" class="share-review-btn" data-id="${i.id}" ${(i.reviewer_payload && !i.reviewer_feedback_visible) ? "" : "disabled"}>${i.reviewer_feedback_visible ? "Shared with Assignee" : "Share with Assignee"}</button>
      </div>
      ${renderSelf(i)}
      <div id="reviewer-${i.id}" style="display:none;">${renderReviewer(i)}</div>
    </article>
  `).join("") || "<p>No assignments.</p>";

  overview.querySelectorAll(".show-review-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const el = document.getElementById(`reviewer-${id}`);
      if (!el) return;
      const hidden = el.style.display === "none";
      el.style.display = hidden ? "block" : "none";
      btn.textContent = hidden ? "Hide Reviewer Review" : "Show Reviewer Review";
    });
  });

  overview.querySelectorAll(".share-review-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      try {
        await api(`/api/admin/assignments/${id}/share-review`, { method: "POST" });
        assignStatus.textContent = `Reviewer feedback shared for assignment #${id}.`;
        await loadOverview();
      } catch (err) {
        assignStatus.textContent = err.message;
      }
    });
  });
}

if (!dueDate.value) {
  const t = new Date();
  dueDate.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

await loadUsers();
await loadOverview();

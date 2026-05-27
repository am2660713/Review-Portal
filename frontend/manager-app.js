import { api, clearSession, getUser, requireRole } from "./auth.js";

requireRole("manager");
const user = getUser();
if (user) {
  document.getElementById("selfHeading").textContent = `${user.name} - My Self Review Forms`;
  document.getElementById("teamHeading").textContent = `${user.name} - Team Lead Review Forms`;
  document.getElementById("pageTitle").textContent = `${user.name} - Manager Dashboard`;
}

const selfList = document.getElementById("selfAssignmentList");
const teamList = document.getElementById("teamAssignmentList");
const hierarchyOverview = document.getElementById("hierarchyOverview");
const employeeSelect = document.getElementById("employeeSelect");
const assignYear = document.getElementById("assignYear");
const assignDueDate = document.getElementById("assignDueDate");
const assignStatus = document.getElementById("assignStatus");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };
document.getElementById("tabSelf").onclick = () => { document.getElementById("panelSelf").style.display = "block"; document.getElementById("panelTeam").style.display = "none"; };
document.getElementById("tabTeam").onclick = () => { document.getElementById("panelSelf").style.display = "none"; document.getElementById("panelTeam").style.display = "block"; };

document.getElementById("assignBtn").onclick = async () => {
  assignStatus.textContent = "Assigning...";
  try {
    await api("/api/manager/assignments", { method: "POST", body: JSON.stringify({ assigneeUserId: Number(employeeSelect.value), reviewYear: Number(assignYear.value), dueDate: assignDueDate.value }) });
    assignStatus.textContent = "Review assigned successfully.";
    await loadTeamAssignments();
  } catch (err) { assignStatus.textContent = err.message; }
};

async function loadAssignees() {
  const rows = await api("/api/manager/teamleads");
  employeeSelect.innerHTML = rows.map(e => `<option value="${e.id}">${e.name} (${e.email})</option>`).join("");
}

async function loadSelfAssignments() {
  const items = await api("/api/self/assignments");
  selfList.innerHTML = items.map(i => `
    <article class="feedback-item">
      <strong>Assignment #${i.id}</strong>
      <div class="meta">Reviewer: ${i.reviewer_name} (${i.reviewer_role}) | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Status: ${i.status}</div>
      <button type="button" class="open-self-btn" data-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>${i.status === "closed" || i.status === "reviewer_submitted" ? "Filled / Locked" : "Open My Review Form"}</button>
    </article>
  `).join("") || "<p>No self-review assignments yet.</p>";

  selfList.querySelectorAll(".open-self-btn").forEach((btn) => btn.addEventListener("click", () => {
    window.location.href = `/manager-self-review.html?assignmentId=${btn.getAttribute("data-id")}`;
  }));
}

async function loadTeamAssignments() {
  const items = await api("/api/manager/assignments");
  teamList.innerHTML = items.map(i => `
    <article class="feedback-item">
      <strong>Assignment #${i.id} - ${i.assignee_name}</strong>
      <div class="meta">${i.assignee_email} | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Self Submitted: ${i.self_submitted ? "Yes" : "No"} | Status: ${i.status}</div>
      <div class="row-actions">
        <button type="button" class="open-review-btn" data-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>${i.status === "closed" || i.status === "reviewer_submitted" ? "Filled / Locked" : "Open Team Lead Review Form"}</button>
        <button type="button" class="danger-btn" data-delete-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>Delete Review Form</button>
      </div>
    </article>
  `).join("") || "<p>No team lead assignments yet.</p>";

  teamList.querySelectorAll(".open-review-btn").forEach((btn) => btn.addEventListener("click", () => {
    window.location.href = `/manager-review.html?assignmentId=${btn.getAttribute("data-id")}`;
  }));

  teamList.querySelectorAll(".danger-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-delete-id");
    if (!confirm(`Delete assignment #${id}?`)) return;
    try { await api(`/api/reviewer/assignments/${id}`, { method: "DELETE" }); assignStatus.textContent = `Assignment #${id} deleted.`; await loadTeamAssignments(); }
    catch (err) { assignStatus.textContent = err.message; }
  }));
}

async function loadHierarchyOverview() {
  const data = await api("/api/manager/hierarchy-overview");
  const leadCards = data.teamLeads.map(l => `
    <article class="feedback-item">
      <strong>Team Lead: ${l.teamlead_name}</strong>
      <div class="meta">${l.teamlead_email} | Year: ${l.review_year} | Status: ${l.status}</div>
      <details class="inline-details">
        <summary>Team Lead Self Review</summary>
        ${l.self_payload ? `<div class="meta">Innovation: ${l.self_payload.innovation ?? "-"} | Goal: ${l.self_payload.goalAchievement ?? "-"} | Team: ${l.self_payload.teamWork ?? "-"}</div><div class="meta">Comments: ${l.self_payload.selfComments ?? "-"}</div>` : `<div class="meta">Not submitted yet.</div>`}
      </details>
    </article>
  `);

  const empCards = data.employees.map(e => `
    <article class="feedback-item">
      <strong>Employee: ${e.employee_name}</strong>
      <div class="meta">${e.employee_email} | Team Lead: ${e.teamlead_name} | Year: ${e.review_year} | Status: ${e.status}</div>
      <details class="inline-details">
        <summary>Employee Self Review</summary>
        ${e.self_payload ? `<div class="meta">Innovation: ${e.self_payload.innovation ?? "-"} | Goal: ${e.self_payload.goalAchievement ?? "-"} | Team: ${e.self_payload.teamWork ?? "-"}</div><div class="meta">Comments: ${e.self_payload.selfComments ?? "-"}</div>` : `<div class="meta">Not submitted yet.</div>`}
      </details>
    </article>
  `);

  hierarchyOverview.innerHTML = (leadCards.concat(empCards)).join("") || "<p>No hierarchy data available.</p>";
}

const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.onclick = async () => {
    const token = localStorage.getItem("token") || "";
    const res = await fetch("http://localhost:3000/api/reviews/download-docx", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { assignStatus.textContent = "Download failed"; return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reviews.docx";
    a.click();
    URL.revokeObjectURL(url);
  };
}

await loadAssignees();
if (!assignDueDate.value) {
  const t = new Date();
  assignDueDate.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
await loadSelfAssignments();
await loadTeamAssignments();
await loadHierarchyOverview();

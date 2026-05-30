import { API_BASE, api, clearSession, getUser, requireRole } from "./auth.js";

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
  const renderSelfPayload = (p) => {
    if (!p) return `<div class="meta">Self review not submitted yet.</div>`;
    return `<div class="meta"><strong>Overall notes:</strong> ${p.selfComments ?? "-"}</div>
      <div class="meta"><strong>Innovation:</strong> ${p.innovation ?? "-"} | <strong>Goal:</strong> ${p.goalAchievement ?? "-"} | <strong>Team Work:</strong> ${p.teamWork ?? "-"}</div>
      <div class="meta"><strong>Commitment:</strong> ${p.commitment ?? "-"} | <strong>Technical:</strong> ${p.technicalLearning ?? "-"} | <strong>Support:</strong> ${p.softwareSupport ?? "-"}</div>
      <div class="meta"><strong>Graphics:</strong> ${p.graphicsLearning ?? "-"} | <strong>Site:</strong> ${p.siteActivities ?? "-"} | <strong>Communication:</strong> ${p.communication ?? "-"}</div>
      <div class="meta"><strong>Problem Solving:</strong> ${p.problemSolving ?? "-"} | <strong>Time:</strong> ${p.timeManagement ?? "-"}</div>
      <div class="meta"><strong>Skills Learned:</strong> ${p.skillsLearned ?? "-"}</div>
      <div class="meta"><strong>Development Work:</strong> ${p.softwareHardware ?? "-"}</div>
      <div class="meta"><strong>Graphics Skills:</strong> ${p.graphicsSkills ?? "-"}</div>
      <div class="meta"><strong>Site Activities Summary:</strong> ${p.siteActivitiesSummary ?? "-"}</div>
      <div class="meta"><strong>Achievements:</strong> ${p.achievements ?? "-"}</div>
      <div class="meta"><strong>Challenges:</strong> ${p.challenges ?? "-"}</div>`;
  };
  teamList.innerHTML = items.map(i => `
    <article class="feedback-item">
      <strong>Assignment #${i.id} - ${i.assignee_name}</strong>
      <div class="meta">${i.assignee_email} | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Self Submitted: ${i.self_submitted ? "Yes" : "No"} | Status: ${i.status}</div>
      <details class="inline-details"><summary>View Team Lead Self Review</summary>${renderSelfPayload(i.self_payload)}</details>
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
  const renderSelfPayload = (p) => {
    if (!p) return `<div class="meta">Not submitted yet.</div>`;
    return `<div class="meta"><strong>Overall notes:</strong> ${p.selfComments ?? "-"}</div>
      <div class="meta"><strong>Innovation:</strong> ${p.innovation ?? "-"} | <strong>Goal:</strong> ${p.goalAchievement ?? "-"} | <strong>Team Work:</strong> ${p.teamWork ?? "-"}</div>
      <div class="meta"><strong>Commitment:</strong> ${p.commitment ?? "-"} | <strong>Technical:</strong> ${p.technicalLearning ?? "-"} | <strong>Support:</strong> ${p.softwareSupport ?? "-"}</div>
      <div class="meta"><strong>Graphics:</strong> ${p.graphicsLearning ?? "-"} | <strong>Site:</strong> ${p.siteActivities ?? "-"} | <strong>Communication:</strong> ${p.communication ?? "-"}</div>
      <div class="meta"><strong>Problem Solving:</strong> ${p.problemSolving ?? "-"} | <strong>Time:</strong> ${p.timeManagement ?? "-"}</div>
      <div class="meta"><strong>Skills Learned:</strong> ${p.skillsLearned ?? "-"}</div>
      <div class="meta"><strong>Development Work:</strong> ${p.softwareHardware ?? "-"}</div>
      <div class="meta"><strong>Graphics Skills:</strong> ${p.graphicsSkills ?? "-"}</div>
      <div class="meta"><strong>Site Activities Summary:</strong> ${p.siteActivitiesSummary ?? "-"}</div>
      <div class="meta"><strong>Achievements:</strong> ${p.achievements ?? "-"}</div>
      <div class="meta"><strong>Challenges:</strong> ${p.challenges ?? "-"}</div>`;
  };
  const leadCards = data.teamLeads.map(l => `
    <article class="feedback-item">
      <strong>Team Lead: ${l.teamlead_name}</strong>
      <div class="meta">${l.teamlead_email} | Year: ${l.review_year} | Status: ${l.status}</div>
      <details class="inline-details">
        <summary>Team Lead Self Review</summary>
        ${renderSelfPayload(l.self_payload)}
      </details>
    </article>
  `);

  const empCards = data.employees.map(e => `
    <article class="feedback-item">
      <strong>Employee: ${e.employee_name}</strong>
      <div class="meta">${e.employee_email} | Team Lead: ${e.teamlead_name} | Year: ${e.review_year} | Status: ${e.status}</div>
      <details class="inline-details">
        <summary>Employee Self Review</summary>
        ${renderSelfPayload(e.self_payload)}
      </details>
    </article>
  `);

  hierarchyOverview.innerHTML = (leadCards.concat(empCards)).join("") || "<p>No hierarchy data available.</p>";
}

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

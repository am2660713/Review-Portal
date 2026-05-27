import { api, clearSession, getUser, requireRole } from "./auth.js";

requireRole("teamlead");
const user = getUser();
if (user) {
  document.getElementById("pageTitle").textContent = `${user.name} - Team Lead Dashboard`;
  document.getElementById("selfHeading").textContent = `${user.name} - My Self Review Forms`;
  document.getElementById("empHeading").textContent = `${user.name} - Employee Review Forms`;
}

const selfList = document.getElementById("selfAssignmentList");
const empList = document.getElementById("empAssignmentList");
const employeeSelect = document.getElementById("employeeSelect");
const assignYear = document.getElementById("assignYear");
const assignDueDate = document.getElementById("assignDueDate");
const assignStatus = document.getElementById("assignStatus");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };
document.getElementById("tabSelf").onclick = () => { document.getElementById("panelSelf").style.display = "block"; document.getElementById("panelEmp").style.display = "none"; };
document.getElementById("tabEmp").onclick = () => { document.getElementById("panelSelf").style.display = "none"; document.getElementById("panelEmp").style.display = "block"; };

document.getElementById("assignBtn").onclick = async () => {
  assignStatus.textContent = "Assigning...";
  try {
    await api("/api/teamlead/assignments", { method: "POST", body: JSON.stringify({ assigneeUserId: Number(employeeSelect.value), reviewYear: Number(assignYear.value), dueDate: assignDueDate.value }) });
    assignStatus.textContent = "Review assigned successfully.";
    await loadEmpAssignments();
  } catch (err) { assignStatus.textContent = err.message; }
};

async function loadEmployees() {
  const rows = await api("/api/teamlead/employees");
  employeeSelect.innerHTML = rows.map(e => `<option value="${e.id}">${e.name} (${e.email})</option>`).join("");
}

async function loadSelfAssignments() {
  const items = await api("/api/self/assignments");
  selfList.innerHTML = items.map(i => `
    <article class="feedback-item"><strong>Assignment #${i.id}</strong><div class="meta">Reviewer: ${i.reviewer_name} (${i.reviewer_role}) | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Status: ${i.status}</div><button type="button" class="open-self-btn" data-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>${i.status === "closed" || i.status === "reviewer_submitted" ? "Filled / Locked" : "Open My Review Form"}</button></article>
  `).join("") || "<p>No self-review assignments yet.</p>";

  selfList.querySelectorAll(".open-self-btn").forEach((btn) => btn.addEventListener("click", () => {
    window.location.href = `/manager-self-review.html?assignmentId=${btn.getAttribute("data-id")}`;
  }));
}

async function loadEmpAssignments() {
  const items = await api("/api/teamlead/assignments");
  empList.innerHTML = items.map(i => `
    <article class="feedback-item"><strong>Assignment #${i.id} - ${i.assignee_name}</strong><div class="meta">${i.assignee_email} | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Self Submitted: ${i.self_submitted ? "Yes" : "No"} | Status: ${i.status}</div><details class="inline-details"><summary>View Employee Self Review</summary>${i.self_payload ? `<div class="meta">Innovation: ${i.self_payload.innovation ?? "-"} | Goal: ${i.self_payload.goalAchievement ?? "-"} | Team Work: ${i.self_payload.teamWork ?? "-"}</div><div class="meta">Technical: ${i.self_payload.technicalLearning ?? "-"} | Communication: ${i.self_payload.communication ?? "-"} | Time: ${i.self_payload.timeManagement ?? "-"}</div><div class="meta">Self Comments: ${i.self_payload.selfComments ?? "-"}</div>` : `<div class="meta">Self review not submitted yet.</div>`}</details><div class="row-actions"><button type="button" class="open-review-btn" data-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>${i.status === "closed" || i.status === "reviewer_submitted" ? "Filled / Locked" : "Open Employee Review Form"}</button><button type="button" class="danger-btn" data-delete-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>Delete Review Form</button></div></article>
  `).join("") || "<p>No employee assignments yet.</p>";

  empList.querySelectorAll(".open-review-btn").forEach((btn) => btn.addEventListener("click", () => {
    window.location.href = `/teamlead-review.html?assignmentId=${btn.getAttribute("data-id")}`;
  }));

  empList.querySelectorAll(".danger-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-delete-id");
    if (!confirm(`Delete assignment #${id}?`)) return;
    try { await api(`/api/reviewer/assignments/${id}`, { method: "DELETE" }); assignStatus.textContent = `Assignment #${id} deleted.`; await loadEmpAssignments(); }
    catch (err) { assignStatus.textContent = err.message; }
  }));
}

await loadEmployees();
if (!assignDueDate.value) {
  const t = new Date();
  assignDueDate.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
await loadSelfAssignments();
await loadEmpAssignments();

import { api, clearSession, requireRole } from "./auth.js";

requireRole("employee");
const form = document.getElementById("selfReviewForm");
const status = document.getElementById("status");
const assignmentIdInput = document.getElementById("assignmentId");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };
document.getElementById("backBtn").onclick = () => { window.location.href = "/employee.html"; };

async function prefillAssignment() {
  const params = new URLSearchParams(window.location.search);
  const assignmentId = Number(params.get("assignmentId"));
  if (!assignmentId) { status.textContent = "Assignment is missing. Open from Assignments page."; return; }
  const items = await api("/api/self/assignments");
  const item = items.find(i => i.id === assignmentId);
  if (!item) { status.textContent = "This assignment is not available for your account."; return; }
  if (item.status === "closed" || item.status === "reviewer_submitted") {
    status.textContent = "This review is already filled and locked.";
    form.querySelectorAll("input, select, textarea, button").forEach((el) => { if (el.id !== "backBtn" && el.id !== "logoutBtn") el.disabled = true; });
    return;
  }
  assignmentIdInput.value = assignmentId;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "Submitting...";
  const payload = {
    assignmentId: Number(document.getElementById("assignmentId").value),
    overallRating: Number(document.getElementById("overallRating").value),
    payload: {
      innovation: Number(document.getElementById("innovation").value),
      goalAchievement: Number(document.getElementById("goalAchievement").value),
      teamWork: Number(document.getElementById("teamWork").value),
      commitment: Number(document.getElementById("commitment").value),
      technicalLearning: Number(document.getElementById("technicalLearning").value),
      softwareSupport: Number(document.getElementById("softwareSupport").value),
      graphicsLearning: Number(document.getElementById("graphicsLearning").value),
      siteActivities: Number(document.getElementById("siteActivitiesRating").value),
      communication: Number(document.getElementById("communication").value),
      problemSolving: Number(document.getElementById("problemSolving").value),
      timeManagement: Number(document.getElementById("timeManagement").value),
      skillsLearned: document.getElementById("skillsLearned").value,
      softwareHardware: document.getElementById("softwareHardware").value,
      graphicsSkills: document.getElementById("graphicsSkills").value,
      siteActivitiesSummary: document.getElementById("siteActivities").value,
      achievements: document.getElementById("achievements").value,
      challenges: document.getElementById("challenges").value,
      selfComments: document.getElementById("selfComments").value
    }
  };
  try {
    await api("/api/self/review", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = "Submitted successfully.";
    setTimeout(() => { window.location.href = "/employee.html"; }, 1000);
  } catch (err) {
    status.textContent = err.message;
  }
});

prefillAssignment();

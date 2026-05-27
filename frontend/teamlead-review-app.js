import { api, clearSession, requireRole } from "./auth.js";

requireRole("teamlead");
const form = document.getElementById("reviewForm");
const status = document.getElementById("status");
const assignmentIdInput = document.getElementById("assignmentId");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };
document.getElementById("backBtn").onclick = () => { window.location.href = "/teamlead.html"; };

async function prefill() {
  const assignmentId = Number(new URLSearchParams(window.location.search).get("assignmentId"));
  if (!assignmentId) return (status.textContent = "Assignment missing.");
  const items = await api("/api/teamlead/assignments");
  const item = items.find(i => i.id === assignmentId);
  if (!item) return (status.textContent = "Assignment not available.");
  if (item.status === "closed" || item.status === "reviewer_submitted") {
    status.textContent = "This review is already filled and locked.";
    form.querySelectorAll("input, select, textarea, button").forEach((el) => { if (el.id !== "backBtn" && el.id !== "logoutBtn") el.disabled = true; });
  }
  assignmentIdInput.value = assignmentId;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "Submitting...";
  const payload = {
    assignmentId: Number(assignmentIdInput.value),
    overallRating: Number(document.getElementById("overallRating").value),
    payload: {
      quality: Number(document.getElementById("quality").value), productivity: Number(document.getElementById("productivity").value),
      jobKnowledge: Number(document.getElementById("jobKnowledge").value), communication: Number(document.getElementById("communication").value),
      teamwork: Number(document.getElementById("teamwork").value), initiative: Number(document.getElementById("initiative").value),
      reliability: Number(document.getElementById("reliability").value), leadership: Number(document.getElementById("leadership").value),
      strengths: document.getElementById("strengths").value, improvements: document.getElementById("improvements").value,
      developmentPlan: document.getElementById("developmentPlan").value, comments: document.getElementById("comments").value
    }
  };
  try { await api("/api/reviewer/review", { method: "POST", body: JSON.stringify(payload) }); status.textContent = "Submitted successfully."; setTimeout(() => window.location.href = "/teamlead.html", 1000); }
  catch (err) { status.textContent = err.message; }
});

prefill();

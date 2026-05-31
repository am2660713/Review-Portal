import { api, clearSession, requireRole } from "./auth.js";

requireRole("manager");
const form = document.getElementById("managerForm");
const status = document.getElementById("status");
const assignmentIdInput = document.getElementById("assignmentId");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };
document.getElementById("backBtn").onclick = () => { window.location.href = "/manager.html"; };

function initStarRatings() {
  document.querySelectorAll(".star-rating").forEach((group) => {
    const targetId = group.getAttribute("data-target");
    const hidden = document.getElementById(targetId);
    const buttons = Array.from(group.querySelectorAll(".star-btn"));
    const paint = (selectedValue) => {
      const selected = Number(selectedValue || 0);
      buttons.forEach((btn) => {
        const v = Number(btn.getAttribute("data-value"));
        btn.classList.toggle("active", v <= selected);
      });
    };
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        hidden.value = btn.getAttribute("data-value");
        paint(hidden.value);
      });
    });
    paint(hidden.value);
  });
}

async function prefillAssignment() {
  const assignmentId = Number(new URLSearchParams(window.location.search).get("assignmentId"));
  if (!assignmentId) {
    status.textContent = "Assignment is missing.";
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }
  const items = await api("/api/manager/assignments");
  const item = items.find(i => i.id === assignmentId);
  if (!item) return (status.textContent = "Assignment not available.");
  if (item.status === "closed" || item.status === "reviewer_submitted") {
    status.textContent = "This review is already filled and locked.";
    form.querySelectorAll("input, textarea, button").forEach((el) => { if (el.id !== "backBtn" && el.id !== "logoutBtn") el.disabled = true; });
  }
  assignmentIdInput.value = assignmentId;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "Submitting...";

  const ratingIds = ["quality", "productivity", "jobKnowledge", "communication", "teamwork", "initiative", "reliability", "leadership", "overallRating"];
  const unrated = ratingIds.find((id) => !document.getElementById(id).value);
  if (unrated) return (status.textContent = "Please click star rating for all points.");

  const requiredTexts = ["strengths", "improvements", "developmentPlan", "comments"];
  const emptyText = requiredTexts.find((id) => !document.getElementById(id).value.trim());
  if (emptyText) return (status.textContent = "Please fill all required text fields.");

  const payload = {
    assignmentId: Number(assignmentIdInput.value),
    overallRating: Number(document.getElementById("overallRating").value),
    payload: {
      quality: Number(document.getElementById("quality").value),
      productivity: Number(document.getElementById("productivity").value),
      jobKnowledge: Number(document.getElementById("jobKnowledge").value),
      communication: Number(document.getElementById("communication").value),
      teamwork: Number(document.getElementById("teamwork").value),
      initiative: Number(document.getElementById("initiative").value),
      reliability: Number(document.getElementById("reliability").value),
      leadership: Number(document.getElementById("leadership").value),
      ratingNotes: {
        quality: document.getElementById("qualityNote").value,
        productivity: document.getElementById("productivityNote").value,
        jobKnowledge: document.getElementById("jobKnowledgeNote").value,
        communication: document.getElementById("communicationNote").value,
        teamwork: document.getElementById("teamworkNote").value,
        initiative: document.getElementById("initiativeNote").value,
        reliability: document.getElementById("reliabilityNote").value,
        leadership: document.getElementById("leadershipNote").value,
        overall: document.getElementById("overallRatingNote").value
      },
      strengths: document.getElementById("strengths").value.trim(),
      improvements: document.getElementById("improvements").value.trim(),
      developmentPlan: document.getElementById("developmentPlan").value.trim(),
      comments: document.getElementById("comments").value.trim()
    }
  };
  try {
    await api("/api/reviewer/review", { method: "POST", body: JSON.stringify(payload) });
    status.textContent = "Submitted successfully.";
    setTimeout(() => window.location.href = "/manager.html", 1000);
  } catch (err) {
    status.textContent = err.message;
  }
});

initStarRatings();
prefillAssignment();

import { api, clearSession, requireRole } from "./auth.js";

requireRole("employee");
const form = document.getElementById("selfReviewForm");
const status = document.getElementById("status");
const assignmentIdInput = document.getElementById("assignmentId");

document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };
document.getElementById("backBtn").onclick = () => { window.location.href = "/employee.html"; };

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
  const params = new URLSearchParams(window.location.search);
  const assignmentId = Number(params.get("assignmentId"));
  if (!assignmentId) {
    status.textContent = "Assignment is missing. Open from Assignments page.";
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }
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
  const ratingIds = ["innovation", "goalAchievement", "teamWork", "commitment", "technicalLearning", "softwareSupport", "graphicsLearning", "siteActivitiesRating", "communication", "problemSolving", "timeManagement", "overallRating"];
  const unrated = ratingIds.find((id) => !document.getElementById(id).value);
  if (unrated) {
    status.textContent = "Please click star rating for all points.";
    return;
  }
  const requiredTexts = ["skillsLearned", "softwareHardware", "graphicsSkills", "siteActivities", "achievements", "challenges", "selfComments"];
  const emptyText = requiredTexts.find((id) => !document.getElementById(id).value.trim());
  if (emptyText) {
    status.textContent = "Please fill all required text fields.";
    return;
  }
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
      ratingNotes: {
        innovation: document.getElementById("innovationNote").value,
        goalAchievement: document.getElementById("goalAchievementNote").value,
        teamWork: document.getElementById("teamWorkNote").value,
        commitment: document.getElementById("commitmentNote").value,
        technicalLearning: document.getElementById("technicalLearningNote").value,
        softwareSupport: document.getElementById("softwareSupportNote").value,
        graphicsLearning: document.getElementById("graphicsLearningNote").value,
        siteActivities: document.getElementById("siteActivitiesRatingNote").value,
        communication: document.getElementById("communicationNote").value,
        problemSolving: document.getElementById("problemSolvingNote").value,
        timeManagement: document.getElementById("timeManagementNote").value,
        overall: document.getElementById("overallRatingNote").value
      },
      skillsLearned: document.getElementById("skillsLearned").value.trim(),
      softwareHardware: document.getElementById("softwareHardware").value.trim(),
      graphicsSkills: document.getElementById("graphicsSkills").value.trim(),
      siteActivitiesSummary: document.getElementById("siteActivities").value.trim(),
      achievements: document.getElementById("achievements").value.trim(),
      challenges: document.getElementById("challenges").value.trim(),
      selfComments: document.getElementById("selfComments").value.trim()
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

initStarRatings();
prefillAssignment();

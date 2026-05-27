import { api, clearSession, requireRole } from "./auth.js";

requireRole("employee");
const list = document.getElementById("assignmentList");
document.getElementById("logoutBtn").onclick = () => { clearSession(); window.location.href = "/"; };

async function load() {
  const items = await api("/api/self/assignments");
  if (!items.length) {
    list.innerHTML = "<p>No review form assigned yet. Please wait for Team Lead allocation.</p>";
    return;
  }

  list.innerHTML = items.map(i => `
    <article class="feedback-item">
      <strong>Assignment #${i.id}</strong>
      <div class="meta">Reviewer: ${i.reviewer_name} (${i.reviewer_role}) | Year: ${i.review_year} | Due: ${i.due_date ? String(i.due_date).slice(0,10) : "-"} | Status: ${i.status}</div>
      <div class="row-actions">
        <button type="button" class="use-assignment-btn" data-id="${i.id}" ${i.status === "closed" || i.status === "reviewer_submitted" ? "disabled" : ""}>${i.status === "closed" || i.status === "reviewer_submitted" ? "Filled / Locked" : "Open Review Form"}</button>
        <button type="button" class="view-reviewer-btn" data-id="${i.id}" ${(i.reviewer_submitted && i.reviewer_feedback_visible) ? "" : "disabled"}>${(i.reviewer_submitted && i.reviewer_feedback_visible) ? "View Reviewer Feedback" : "Feedback Not Shared"}</button>
      </div>
      <div id="reviewer-feedback-${i.id}" class="inline-details" style="display:none;"></div>
    </article>
  `).join("");

  list.querySelectorAll(".use-assignment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.location.href = `/employee-review.html?assignmentId=${btn.getAttribute("data-id")}`;
    });
  });

  list.querySelectorAll(".view-reviewer-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const assignmentId = btn.getAttribute("data-id");
      const target = document.getElementById(`reviewer-feedback-${assignmentId}`);
      if (!target) return;
      if (target.style.display === "block") {
        target.style.display = "none";
        btn.textContent = "View Reviewer Feedback";
        return;
      }
      try {
        const review = await api(`/api/self/reviewer-feedback/${assignmentId}`);
        const p = review.payload || {};
        target.innerHTML = `<strong>Reviewer Feedback</strong><div class="meta">Overall: ${review.overall_rating ?? "-"} / 5</div><div class="meta">Quality: ${p.quality ?? "-"} | Productivity: ${p.productivity ?? "-"} | Job Knowledge: ${p.jobKnowledge ?? "-"}</div><div class="meta">Final Comments: ${p.comments ?? "-"}</div>`;
        target.style.display = "block";
        btn.textContent = "Hide Reviewer Feedback";
      } catch (err) {
        target.innerHTML = `<div class="meta">${err.message}</div>`;
        target.style.display = "block";
      }
    });
  });
}

load();

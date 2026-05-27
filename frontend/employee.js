const API_BASE = "http://localhost:3000";

const form = document.getElementById("feedbackForm");
const statusText = document.getElementById("status");
const myFeedbackList = document.getElementById("myFeedbackList");
const loadMyFeedbackBtn = document.getElementById("loadMyFeedbackBtn");

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSurveySummary() {
  const roleLevel = document.getElementById("roleLevel").value;
  const tenure = document.getElementById("tenure").value;
  const managerSupport = document.getElementById("managerSupport").value;
  const workload = document.getElementById("workload").value;
  const enps = document.getElementById("enps").value;
  const workMode = document.getElementById("workMode").value;
  const positives = document.getElementById("positives").value.trim();
  const improvements = document.getElementById("improvements").value.trim();
  const detailed = document.getElementById("feedbackText").value.trim();

  return [
    `Role Level: ${roleLevel}`,
    `Tenure: ${tenure}`,
    `Manager Support: ${managerSupport}/5`,
    `Workload Balance: ${workload}/5`,
    `Recommendation Score (eNPS): ${enps}/10`,
    `Preferred Work Mode: ${workMode}`,
    `What Works Well: ${positives}`,
    `Needs Improvement: ${improvements}`,
    `Detailed Suggestion: ${detailed}`
  ].join("\n");
}

function buildSelfPayload() {
  return {
    selfReview: {
      roleLevel: document.getElementById("roleLevel").value,
      tenure: document.getElementById("tenure").value,
      managerSupport: document.getElementById("managerSupport").value,
      workload: document.getElementById("workload").value,
      enps: document.getElementById("enps").value,
      workMode: document.getElementById("workMode").value,
      positives: document.getElementById("positives").value.trim(),
      improvements: document.getElementById("improvements").value.trim(),
      suggestion: document.getElementById("feedbackText").value.trim(),
    }
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    employeeName: document.getElementById("employeeName").value,
    employeeId: document.getElementById("employeeId").value,
    department: document.getElementById("department").value,
    managerName: document.getElementById("managerName").value,
    rating: document.getElementById("rating").value,
    category: document.getElementById("category").value,
    feedbackText: buildSurveySummary(),
    anonymous: document.getElementById("anonymous").checked,
    reviewPayload: buildSelfPayload(),
  };

  statusText.textContent = "Submitting survey...";
  try {
    const response = await fetch(`${API_BASE}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    statusText.textContent = response.ok ? "Survey submitted successfully." : (result.error || "Submission failed.");

    if (response.ok) {
      form.reset();
    }
  } catch {
    statusText.textContent = "Request failed.";
  }
});

loadMyFeedbackBtn.addEventListener("click", async () => {
  const employeeId = document.getElementById("lookupEmployeeId").value.trim();
  if (!employeeId) {
    myFeedbackList.innerHTML = "<p>Please enter your employee ID.</p>";
    return;
  }

  myFeedbackList.innerHTML = "<p>Loading...</p>";
  try {
    const response = await fetch(`${API_BASE}/api/employee/feedback?employeeId=${encodeURIComponent(employeeId)}`);
    const data = await response.json();
    if (!response.ok) {
      myFeedbackList.innerHTML = `<p>${esc(data.error || "Unable to fetch records.")}</p>`;
      return;
    }
    if (!data.length) {
      myFeedbackList.innerHTML = "<p>No submissions found for this employee ID.</p>";
      return;
    }
    myFeedbackList.innerHTML = data.map((item) => `
      <article class="feedback-item">
        <strong>${esc(item.review_type === "manager" ? "Manager Review" : "Self Review")} | ${esc(item.department)} | ${esc(item.manager_name || "Unassigned")}</strong>
        <p>${esc(item.feedback_text)}</p>
        <div class="meta">Category: ${esc(item.category)} | Rating: ${item.rating}/5</div>
      </article>
    `).join("");
  } catch {
    myFeedbackList.innerHTML = "<p>Request failed.</p>";
  }
});

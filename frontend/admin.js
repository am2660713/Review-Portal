const API_BASE = "http://localhost:3000";
const adminLoginForm = document.getElementById("adminLoginForm");
const adminStatus = document.getElementById("adminStatus");
const feedbackList = document.getElementById("feedbackList");
const refreshBtn = document.getElementById("refreshBtn");
const managerReviewForm = document.getElementById("managerReviewForm");
const managerReviewStatus = document.getElementById("managerReviewStatus");
let adminToken = "";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(items) {
  if (!items.length) {
    feedbackList.innerHTML = "<p>No feedback found.</p>";
    return;
  }
  const grouped = items.reduce((acc, item) => {
    const key = item.manager_name || "Unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  feedbackList.innerHTML = Object.entries(grouped).map(([manager, managerItems]) => `
    <section class="manager-group">
      <h3>Manager: ${esc(manager)}</h3>
      ${managerItems.map((item) => `
        <article class="feedback-item">
          <strong>${item.anonymous ? "Anonymous" : esc(item.employee_name)}</strong>
          <p>${esc(item.feedback_text)}</p>
          <div class="meta">ID: ${esc(item.employee_id)} | ${esc(item.department)} | ${esc(item.category)} | Rating: ${item.rating}/5</div>
        </article>
      `).join("")}
    </section>
  `).join("");
}

async function loadData() {
  if (!adminToken) {
    feedbackList.innerHTML = "<p>Please login to view records.</p>";
    return;
  }
  const response = await fetch(`${API_BASE}/api/admin/feedback`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const data = await response.json();
  if (!response.ok) {
    feedbackList.innerHTML = `<p>${esc(data.error || "Unable to fetch")}</p>`;
    return;
  }
  render(data);
}

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminStatus.textContent = "Checking...";
  const username = document.getElementById("adminUsername").value;
  const password = document.getElementById("adminPassword").value;

  try {
    const response = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const result = await response.json();
    if (!response.ok) {
      adminStatus.textContent = result.error || "Login failed";
      return;
    }
    adminToken = result.token;
    adminStatus.textContent = "Access granted";
    loadData();
  } catch {
    adminStatus.textContent = "Unable to login right now.";
  }
});

refreshBtn.addEventListener("click", loadData);
loadData();

managerReviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  managerReviewStatus.textContent = "Submitting manager review...";

  const payload = {
    employeeName: document.getElementById("mgrEmployeeName").value,
    employeeId: document.getElementById("mgrEmployeeId").value,
    department: document.getElementById("mgrDepartment").value,
    managerName: document.getElementById("mgrManagerName").value,
    rating: document.getElementById("mgrOverallRating").value,
    category: document.getElementById("mgrCategory").value,
    feedbackText: document.getElementById("mgrComments").value,
    reviewPayload: {
      managerReview: {
        quality: document.getElementById("qualityRating").value,
        productivity: document.getElementById("productivityRating").value,
        jobKnowledge: document.getElementById("jobKnowledgeRating").value,
        comments: document.getElementById("mgrComments").value
      }
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/manager/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      managerReviewStatus.textContent = result.error || "Submission failed.";
      return;
    }
    managerReviewStatus.textContent = "Manager review submitted.";
    managerReviewForm.reset();
    if (adminToken) {
      await loadData();
    }
  } catch {
    managerReviewStatus.textContent = "Unable to submit right now.";
  }
});

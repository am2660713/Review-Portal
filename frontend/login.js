import { api, setSession } from "./auth.js";

const form = document.getElementById("loginForm");
const status = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "Logging in...";
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: document.getElementById("email").value, password: document.getElementById("password").value })
    });
    setSession(data.token, data.user);
    if (data.user.role === "admin") window.location.href = "/admin.html";
    else if (data.user.role === "manager") window.location.href = "/manager.html";
    else if (data.user.role === "teamlead") window.location.href = "/teamlead.html";
    else window.location.href = "/employee.html";
  } catch (err) {
    status.textContent = err.message;
  }
});

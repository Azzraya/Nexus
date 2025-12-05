/**
 * Admin Authentication Check
 * Include this script at the top of all admin-* pages to enforce authentication
 */

(function () {
  // Check if user is authenticated
  const isAuthenticated =
    sessionStorage.getItem("adminAuthenticated") === "true";
  const authToken = sessionStorage.getItem("adminToken");
  const authExpiry = sessionStorage.getItem("adminTokenExpiry");

  // If not authenticated or token expired, redirect to admin.html
  if (!isAuthenticated || !authToken || !authExpiry) {
    redirectToLogin();
    return;
  }

  // Check if token is expired
  const now = Date.now();
  if (parseInt(authExpiry) < now) {
    // Token expired - clear and redirect
    sessionStorage.removeItem("adminAuthenticated");
    sessionStorage.removeItem("adminToken");
    sessionStorage.removeItem("adminTokenExpiry");
    redirectToLogin();
    return;
  }

  // Verify token with server (optional, async)
  verifyToken();

  function redirectToLogin() {
    // Store current page for redirect after login
    sessionStorage.setItem("adminRedirectAfterLogin", window.location.href);
    window.location.href = "admin.html";
  }

  async function verifyToken() {
    try {
      const response = await fetch(
        "https://regular-puma-clearly.ngrok-free.app/api/admin/verify-token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok && response.status === 401) {
        // Token invalid (only redirect on 401 Unauthorized, not network errors)
        redirectToLogin();
      }
    } catch (error) {
      console.warn("Token verification failed:", error);
      // Continue anyway - might be offline or network error
    }
  }

  // Refresh token expiry on activity
  function refreshExpiry() {
    const newExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes
    sessionStorage.setItem("adminTokenExpiry", newExpiry.toString());
  }

  // Extend session on user activity
  document.addEventListener("click", refreshExpiry);
  document.addEventListener("keypress", refreshExpiry);
})();

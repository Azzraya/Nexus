// API Configuration for GitHub Pages
// This allows easy updates to the backend API URL without editing multiple files
window.NEXUS_API_URL =
  window.NEXUS_API_URL || "https://regular-puma-clearly.ngrok-free.app";

// Set up preconnect for performance
if (document) {
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = window.NEXUS_API_URL;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

// Helper function to get API URL with proper headers
window.getApiConfig = function () {
  return {
    url: window.NEXUS_API_URL,
    headers: {
      "ngrok-skip-browser-warning": "true",
      "Content-Type": "application/json",
    },
  };
};

// Helper function for API calls with error handling
window.apiCall = async function (endpoint, options = {}) {
  const config = window.getApiConfig();
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${config.url}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...config.headers,
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API call failed:", error);

    // Check if offline
    if (!navigator.onLine) {
      console.warn("Device appears to be offline");
      // Service worker may have cached response, but if not, throw helpful error
      throw new Error(
        "You appear to be offline. Please check your connection."
      );
    }

    throw error;
  }
};

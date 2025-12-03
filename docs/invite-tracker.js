// Invite source tracking - captures ?source= parameter and stores it
(function () {
  // Check if there's a source parameter in the URL
  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get("source");

  if (source) {
    // Store the invite source
    localStorage.setItem("nexus_invite_source", source);
    localStorage.setItem("nexus_invite_source_timestamp", Date.now());
    console.log(`[Nexus] Tracked invite source: ${source}`);

    // Also send to API immediately if possible
    try {
      fetch(
        "https://regular-puma-clearly.ngrok-free.app/api/track-invite-click",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            source: source,
            timestamp: Date.now(),
            referrer: document.referrer,
            userAgent: navigator.userAgent,
          }),
        }
      ).catch(() => {}); // Silent fail
    } catch (e) {}
  }

  // If on dashboard login, send the stored source
  if (window.location.pathname.includes("dashboard")) {
    const storedSource = localStorage.getItem("nexus_invite_source");
    const storedTimestamp = localStorage.getItem(
      "nexus_invite_source_timestamp"
    );

    // Only use if less than 7 days old
    if (
      storedSource &&
      storedTimestamp &&
      Date.now() - storedTimestamp < 7 * 24 * 60 * 60 * 1000
    ) {
      // Attach to dashboard authentication
      window.nexusInviteSource = storedSource;
      console.log(
        `[Nexus] Will track dashboard auth with source: ${storedSource}`
      );
    }
  }
})();

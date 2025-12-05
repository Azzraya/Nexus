// Discord invite link
const DISCORD_INVITE =
  "https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=268443574&scope=bot%20applications.commands";

// Simple redirect to Discord
function redirectToDiscord() {
  window.location.href = DISCORD_INVITE;
}

// Set up click handlers
document.addEventListener("DOMContentLoaded", () => {
  // Get all invite buttons
  const inviteButtons = document.querySelectorAll("[data-source]");

  inviteButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      redirectToDiscord();
    });
  });

  // Scroll to top button
  const scrollTopBtn = document.createElement("div");
  scrollTopBtn.className = "scroll-top";
  scrollTopBtn.setAttribute("aria-label", "Scroll to top");
  document.body.appendChild(scrollTopBtn);

  window.addEventListener("scroll", () => {
    if (window.pageYOffset > 300) {
      scrollTopBtn.classList.add("visible");
    } else {
      scrollTopBtn.classList.remove("visible");
    }
  });

  scrollTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
});

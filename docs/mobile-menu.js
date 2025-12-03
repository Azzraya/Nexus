// Mobile menu toggle
document.addEventListener("DOMContentLoaded", () => {
  // Add mobile menu button if not exists
  const navbar = document.querySelector(".navbar .container");
  if (navbar && !document.querySelector(".mobile-menu-toggle")) {
    const menuButton = document.createElement("button");
    menuButton.className = "mobile-menu-toggle";
    menuButton.innerHTML = "☰";
    menuButton.setAttribute("aria-label", "Toggle menu");
    menuButton.onclick = toggleMobileMenu;
    navbar.appendChild(menuButton);
  }
});

function toggleMobileMenu() {
  const navLinks = document.querySelector(".nav-links");
  if (navLinks) {
    navLinks.classList.toggle("active");
    const button = document.querySelector(".mobile-menu-toggle");
    button.innerHTML = navLinks.classList.contains("active") ? "✕" : "☰";
  }
}

// Close menu when clicking a link
document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", () => {
    const navLinks = document.querySelector(".nav-links");
    if (navLinks && window.innerWidth <= 968) {
      navLinks.classList.remove("active");
      const button = document.querySelector(".mobile-menu-toggle");
      if (button) button.innerHTML = "☰";
    }
  });
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  const navbar = document.querySelector(".navbar");
  const navLinks = document.querySelector(".nav-links");
  const menuButton = document.querySelector(".mobile-menu-toggle");

  if (
    navLinks &&
    navLinks.classList.contains("active") &&
    !navbar.contains(e.target)
  ) {
    navLinks.classList.remove("active");
    if (menuButton) menuButton.innerHTML = "☰";
  }
});

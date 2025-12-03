// Nexus Bot - Sophisticated Website Analytics & Click Monitoring
// This system tracks user interactions, page views, and provides insights

const ANALYTICS_URL =
  "https://regular-puma-clearly.ngrok-free.app/api/analytics";

class NexusAnalytics {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.interactions = [];
    this.trackingEnabled = true;
    this.sendInterval = 30000; // Send data every 30 seconds

    // Initialize
    this.init();
  }

  generateSessionId() {
    return (
      "session_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substring(2, 15)
    );
  }

  init() {
    // Track page view on load
    this.trackPageView();

    // Track link clicks
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (link) {
        this.trackClick("link", {
          href: link.href,
          text: link.textContent.trim(),
          class: link.className,
        });
      }

      // Track button clicks
      const button = e.target.closest("button");
      if (button) {
        this.trackClick("button", {
          text: button.textContent.trim(),
          class: button.className,
          id: button.id,
        });
      }
    });

    // Track scroll depth
    let maxScroll = 0;
    window.addEventListener("scroll", () => {
      const scrollPercent =
        (window.scrollY /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100;
      if (scrollPercent > maxScroll) {
        maxScroll = Math.round(scrollPercent);
        if (maxScroll >= 25 && maxScroll % 25 === 0) {
          this.trackEvent("scroll", { depth: maxScroll + "%" });
        }
      }
    });

    // Track time on page
    window.addEventListener("beforeunload", () => {
      this.trackEvent("session_end", {
        duration: Date.now() - this.startTime,
      });
      this.sendAnalytics(true); // Send immediately
    });

    // Track visibility changes (tab switching)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.trackEvent("tab_hidden");
      } else {
        this.trackEvent("tab_visible");
      }
    });

    // Periodic send
    setInterval(() => {
      if (this.interactions.length > 0) {
        this.sendAnalytics();
      }
    }, this.sendInterval);
  }

  trackPageView() {
    // Parse URL parameters for tracking
    const urlParams = new URLSearchParams(window.location.search);
    const trackingParams = {
      source: urlParams.get("source") || urlParams.get("utm_source"),
      medium: urlParams.get("medium") || urlParams.get("utm_medium"),
      campaign: urlParams.get("campaign") || urlParams.get("utm_campaign"),
      ref: urlParams.get("ref"),
      content: urlParams.get("content") || urlParams.get("utm_content"),
      term: urlParams.get("term") || urlParams.get("utm_term"),
    };

    // Remove null values
    Object.keys(trackingParams).forEach((key) => {
      if (!trackingParams[key]) delete trackingParams[key];
    });

    this.trackEvent("pageview", {
      page: window.location.pathname,
      referrer: document.referrer,
      title: document.title,
      tracking: trackingParams,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      userAgent: navigator.userAgent,
      language: navigator.language,
    });

    // Store tracking params in session for attribution
    if (Object.keys(trackingParams).length > 0) {
      sessionStorage.setItem("nexus_tracking", JSON.stringify(trackingParams));
    }
  }

  trackClick(type, data) {
    this.trackEvent("click", {
      type,
      ...data,
      position: {
        x: event.clientX,
        y: event.clientY,
      },
    });
  }

  trackEvent(eventType, data = {}) {
    if (!this.trackingEnabled) return;

    const event = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      type: eventType,
      page: window.location.pathname,
      data: data,
    };

    this.interactions.push(event);

    // If buffer is too large, send immediately
    if (this.interactions.length >= 50) {
      this.sendAnalytics();
    }
  }

  async sendAnalytics(immediate = false) {
    if (this.interactions.length === 0) return;

    const payload = {
      sessionId: this.sessionId,
      events: [...this.interactions],
      metadata: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
        },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    // Clear interactions immediately to prevent duplicates
    this.interactions = [];

    try {
      if (immediate && navigator.sendBeacon) {
        // Use sendBeacon for page unload (guaranteed to send)
        navigator.sendBeacon(ANALYTICS_URL + "/track", JSON.stringify(payload));
      } else {
        // Regular fetch for normal tracking
        await fetch(ANALYTICS_URL + "/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify(payload),
          keepalive: immediate, // Keep connection alive for page unload
        });
      }
    } catch (error) {
      console.debug("Analytics send failed (non-critical):", error.message);
      // Silently fail - analytics should never break the site
    }
  }

  // Public API for manual tracking
  track(eventName, data = {}) {
    this.trackEvent("custom", { name: eventName, ...data });
  }

  // Opt-out
  disable() {
    this.trackingEnabled = false;
    this.interactions = [];
  }

  // Opt-in
  enable() {
    this.trackingEnabled = true;
  }
}

// Auto-initialize (respecting Do Not Track)
if (navigator.doNotTrack !== "1" && navigator.doNotTrack !== "yes") {
  window.nexusAnalytics = new NexusAnalytics();
} else {
  console.log("Analytics disabled: Do Not Track is enabled");
}

// Expose for manual tracking
window.trackEvent = (name, data) => {
  if (window.nexusAnalytics) {
    window.nexusAnalytics.track(name, data);
  }
};

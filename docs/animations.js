// Premium website animations - typing effect and scroll reveals

// ==================== TYPING ANIMATION ====================
class TypingAnimation {
  constructor(elementId, texts, typingSpeed = 100, deletingSpeed = 50, pauseDuration = 2000) {
    this.element = document.getElementById(elementId);
    if (!this.element) return;
    
    this.texts = texts;
    this.typingSpeed = typingSpeed;
    this.deletingSpeed = deletingSpeed;
    this.pauseDuration = pauseDuration;
    this.textIndex = 0;
    this.charIndex = 0;
    this.isDeleting = false;
    
    this.type();
  }
  
  type() {
    const currentText = this.texts[this.textIndex];
    
    if (this.isDeleting) {
      this.element.textContent = currentText.substring(0, this.charIndex - 1);
      this.charIndex--;
    } else {
      this.element.textContent = currentText.substring(0, this.charIndex + 1);
      this.charIndex++;
    }
    
    let timeout = this.isDeleting ? this.deletingSpeed : this.typingSpeed;
    
    if (!this.isDeleting && this.charIndex === currentText.length) {
      timeout = this.pauseDuration;
      this.isDeleting = true;
    } else if (this.isDeleting && this.charIndex === 0) {
      this.isDeleting = false;
      this.textIndex = (this.textIndex + 1) % this.texts.length;
      timeout = 500;
    }
    
    setTimeout(() => this.type(), timeout);
  }
}

// ==================== SCROLL REVEAL ANIMATIONS ====================
class ScrollReveal {
  constructor() {
    this.elements = [];
    this.init();
    window.addEventListener('scroll', () => this.reveal());
    window.addEventListener('resize', () => this.reveal());
  }
  
  init() {
    // Find all elements to animate
    const selectors = [
      '.stat-card',
      '.feature',
      '.card',
      '.achievement-badge',
      '.activity-item',
      '.testimonial-slide',
      '.server-card',
      '.changelog-entry',
      '.feature-category',
      '.setting-card'
    ];
    
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!el.classList.contains('revealed')) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(30px)';
          el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          this.elements.push(el);
        }
      });
    });
    
    // Initial reveal for elements already in view
    this.reveal();
  }
  
  reveal() {
    this.elements.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;
      
      // Element is in viewport
      if (rect.top <= windowHeight - 100) {
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          el.classList.add('revealed');
        }, index * 50); // Stagger animations
      }
    });
  }
}

// ==================== FLOATING ACTION BUTTON ====================
function createFloatingActionButton() {
  const fab = document.createElement('div');
  fab.id = 'fab';
  fab.innerHTML = `
    <button style="
      position: fixed;
      bottom: 100px;
      right: 30px;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 1.5rem;
      cursor: pointer;
      z-index: 999;
      box-shadow: 0 5px 25px rgba(102, 126, 234, 0.5);
      transition: all 0.3s;
      display: none;
    " id="quickActions" onclick="toggleQuickMenu()">
      ⚡
    </button>
    <div id="quickMenu" style="
      position: fixed;
      bottom: 170px;
      right: 30px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 15px;
      padding: 15px;
      display: none;
      z-index: 998;
      box-shadow: 0 5px 25px rgba(0, 0, 0, 0.3);
      min-width: 200px;
    ">
      <a href="setup-wizard.html" style="display: block; padding: 12px; color: #333; text-decoration: none; border-radius: 8px; margin-bottom: 5px; transition: all 0.3s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background=''">
        🚀 Setup Wizard
      </a>
      <a href="search.html" style="display: block; padding: 12px; color: #333; text-decoration: none; border-radius: 8px; margin-bottom: 5px; transition: all 0.3s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background=''">
        🔍 Search Commands
      </a>
      <a href="growth.html" style="display: block; padding: 12px; color: #333; text-decoration: none; border-radius: 8px; margin-bottom: 5px; transition: all 0.3s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background=''">
        📈 Growth Stats
      </a>
      <a href="https://regular-puma-clearly.ngrok-free.app" target="_blank" style="display: block; padding: 12px; color: #333; text-decoration: none; border-radius: 8px; transition: all 0.3s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background=''">
        🎛️ Dashboard
      </a>
    </div>
  `;
  document.body.appendChild(fab);
  
  // Show FAB after scrolling 300px
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('quickActions');
    if (btn) {
      btn.style.display = window.scrollY > 300 ? 'block' : 'none';
    }
  });
}

function toggleQuickMenu() {
  const menu = document.getElementById('quickMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('quickMenu');
  const fab = document.getElementById('quickActions');
  if (menu && fab && !menu.contains(e.target) && !fab.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ==================== AUTO-INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
  // Typing animation on homepage
  const tagline = document.getElementById('typing-tagline');
  if (tagline) {
    new TypingAnimation('typing-tagline', [
      'Beyond Wick. Beyond Everything.',
      'Free. Open Source. Powerful.',
      'AI-Powered Discord Protection.',
      'Trusted by 17+ Servers.',
      'Zero Cost. Complete Transparency.'
    ]);
  }
  
  // Scroll reveal animations
  new ScrollReveal();
  
  // Floating action button
  createFloatingActionButton();
  
  console.log('✨ Premium animations loaded');
});


// Live Support Chat Widget
// Embedded chat that connects to Discord support server

class SupportChat {
  constructor() {
    this.isOpen = false;
    this.createWidget();
  }

  createWidget() {
    const widget = document.createElement("div");
    widget.id = "support-chat-widget";
    widget.innerHTML = `
      <style>
        #support-chat-container {
          position: fixed;
          bottom: 90px;
          right: 30px;
          width: 350px;
          height: 500px;
          background: white;
          border-radius: 15px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          display: none;
          flex-direction: column;
          z-index: 9999;
          overflow: hidden;
        }

        #support-chat-container.open {
          display: flex;
        }

        .chat-header {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .chat-close {
          background: none;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
        }

        .chat-body {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          background: #f5f5f5;
        }

        .chat-message {
          margin: 15px 0;
          padding: 12px;
          border-radius: 10px;
          max-width: 80%;
        }

        .chat-message.bot {
          background: #e9ecef;
          margin-right: auto;
          color: #1a202c;
          font-weight: 500;
        }

        .chat-message.user {
          background: #667eea;
          color: white;
          margin-left: auto;
        }

        .chat-input-container {
          padding: 20px;
          background: white;
          border-top: 1px solid #eee;
          display: flex;
          gap: 10px;
        }

        .chat-input {
          flex: 1;
          padding: 12px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.95rem;
        }

        .chat-send {
          padding: 12px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }

        .chat-send:hover {
          background: #5568d3;
        }

        #support-chat-button {
          position: fixed;
          bottom: 30px;
          right: 30px;
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border: none;
          border-radius: 50%;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
          box-shadow: 0 5px 25px rgba(102, 126, 234, 0.5);
          z-index: 9998;
          transition: all 0.3s;
        }

        #support-chat-button:hover {
          transform: scale(1.1);
        }

        @media (max-width: 480px) {
          #support-chat-container {
            width: calc(100vw - 20px);
            height: calc(100vh - 100px);
            right: 10px;
            bottom: 10px;
          }
        }
      </style>

      <button id="support-chat-button" onclick="toggleSupportChat()">💬</button>

      <div id="support-chat-container">
        <div class="chat-header">
          <h3>💬 Support Chat</h3>
          <button class="chat-close" onclick="toggleSupportChat()">×</button>
        </div>
        <div class="chat-body" id="chatBody">
          <div class="chat-message bot">
            <strong>Nexus Support</strong><br>
            Hi! How can we help you today?<br><br>
            Quick links:<br>
            • <a href="docs.html" style="color: #667eea;">Documentation</a><br>
            • <a href="faq.html" style="color: #667eea;">FAQ</a><br>
            • <a href="tutorial.html" style="color: #667eea;">Tutorial</a>
          </div>
          <div class="chat-message bot">
            <strong>Or join our Discord:</strong><br>
            <a href="https://discord.gg/your-server" target="_blank" style="color: #667eea; font-weight: bold;">
              Join Support Server →
            </a>
          </div>
        </div>
        <div class="chat-input-container">
          <input type="text" class="chat-input" placeholder="Type your question..." id="chatInput" onkeypress="if(event.key==='Enter') sendMessage()">
          <button class="chat-send" onclick="sendMessage()">Send</button>
        </div>
      </div>
    `;

    document.body.appendChild(widget);
  }
}

function toggleSupportChat() {
  const container = document.getElementById("support-chat-container");
  container.classList.toggle("open");

  if (container.classList.contains("open")) {
    document.getElementById("chatInput").focus();
  }
}

function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();

  if (!message) return;

  const chatBody = document.getElementById("chatBody");

  // Add user message
  const userMsg = document.createElement("div");
  userMsg.className = "chat-message user";
  userMsg.textContent = message;
  chatBody.appendChild(userMsg);

  input.value = "";

  // Auto-scroll
  chatBody.scrollTop = chatBody.scrollHeight;

  // Auto-reply
  setTimeout(() => {
    const botMsg = document.createElement("div");
    botMsg.className = "chat-message bot";
    botMsg.innerHTML = `<strong>Nexus Support</strong><br>Thanks for your message! For the fastest response, please join our Discord support server where our team and community can help you immediately.`;
    chatBody.appendChild(botMsg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 1000);
}

// Initialize chat widget
document.addEventListener("DOMContentLoaded", () => {
  new SupportChat();
});

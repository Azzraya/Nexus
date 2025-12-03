// Discord invite link
const DISCORD_INVITE = "https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=268443574&scope=bot%20applications.commands";

// Simple redirect to Discord
function redirectToDiscord() {
    window.location.href = DISCORD_INVITE;
}

// Set up click handlers
document.addEventListener('DOMContentLoaded', () => {
    // Get all invite buttons
    const inviteButtons = document.querySelectorAll('[data-source]');
    
    inviteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            redirectToDiscord();
        });
    });
});

// Don't track page views - only track clicks


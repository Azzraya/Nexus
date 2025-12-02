// Tracking Configuration
const WEBHOOK_URL = "https://discord.com/api/webhooks/1445562481916383294/b2fJOtmATtEIZXITmDvy1Tm5ZTyKu-M8H6dha30Ly8cUhsN4dgdpjAwuco8cr2hf0IVR";
const DISCORD_INVITE = "https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=268443574&scope=bot%20applications.commands";

// Auto-detect source from referrer or URL parameter
function detectSource() {
    // First, check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlSource = urlParams.get('source');
    if (urlSource) return urlSource;
    
    // If no URL parameter, auto-detect from referrer
    const referrer = document.referrer.toLowerCase();
    
    if (referrer.includes('top.gg')) return 'topgg';
    if (referrer.includes('discordbotlist.com')) return 'discordbotlist';
    if (referrer.includes('voidbots.net')) return 'voidbots';
    if (referrer.includes('discord.bots.gg')) return 'discordbots';
    if (referrer.includes('bots.ondiscord.xyz')) return 'botsondicord';
    if (referrer.includes('reddit.com')) return 'reddit';
    if (referrer.includes('youtube.com') || referrer.includes('youtu.be')) return 'youtube';
    if (referrer.includes('twitter.com') || referrer.includes('x.com')) return 'twitter';
    if (referrer.includes('tiktok.com')) return 'tiktok';
    if (referrer.includes('discord.com') || referrer.includes('discord.gg')) return 'discord';
    if (referrer.includes('google.com')) return 'google';
    
    return 'direct';
}

// Track click and redirect
async function trackAndRedirect(source) {
    const finalSource = source || detectSource();
    
    const data = {
        source: finalSource,
        timestamp: new Date().toISOString(),
        referrer: document.referrer || 'direct',
    };

    // Console log for debugging
    console.log('[Nexus Click Tracked]', data);

    // Send to webhook (non-blocking)
    sendToWebhook(data).catch(err => console.error('Webhook error:', err));

    // Redirect immediately (don't wait for webhook)
    window.location.href = DISCORD_INVITE;
}

// Send tracking data to Discord webhook
async function sendToWebhook(data) {
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                embeds: [{
                    title: '📊 Nexus Invite Click',
                    color: 0x667eea,
                    fields: [
                        {
                            name: 'Source',
                            value: data.source,
                            inline: true
                        },
                        {
                            name: 'Referrer',
                            value: data.referrer.substring(0, 100) || 'Direct',
                            inline: true
                        },
                        {
                            name: 'Time',
                            value: `<t:${Math.floor(new Date(data.timestamp).getTime() / 1000)}:F>`,
                            inline: false
                        }
                    ],
                    footer: {
                        text: `${data.userAgent.substring(0, 50)}...`
                    },
                    timestamp: data.timestamp
                }]
            })
        });
    } catch (error) {
        // Silently fail - don't block user
        console.error('Failed to send tracking:', error);
    }
}

// Set up click handlers
document.addEventListener('DOMContentLoaded', () => {
    // Get all invite buttons
    const inviteButtons = document.querySelectorAll('[data-source]');
    
    inviteButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const source = button.getAttribute('data-source');
            trackAndRedirect(source);
        });
    });
});

// Don't track page views - only track clicks


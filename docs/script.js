// Tracking Configuration
const WEBHOOK_URL = "https://discord.com/api/webhooks/1445461285947838545/6usnevFUWY9YfaOtHU5V2nDRhzntLwPA4csNuolmIksymRYK0OIdHjeCj10f3ZqfSqJx";
const DISCORD_INVITE = "https://discord.com/oauth2/authorize?client_id=1444739230679957646&permissions=268443574&scope=bot%20applications.commands";

// Track click and redirect
async function trackAndRedirect(source) {
    const data = {
        source: source,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        referrer: document.referrer || 'direct',
        screenSize: `${window.screen.width}x${window.screen.height}`,
    };

    // Console log for debugging
    console.log('[Nexus Tracking]', data);

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

// Track page views
window.addEventListener('load', () => {
    const pageData = {
        source: 'page_view',
        timestamp: new Date().toISOString(),
        referrer: document.referrer || 'direct',
        page: window.location.pathname,
    };

    console.log('[Nexus Page View]', pageData);

    // Send page view to webhook
    fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{
                title: '👁️ Nexus Page View',
                color: 0x5865f2,
                fields: [
                    {
                        name: 'Referrer',
                        value: pageData.referrer.substring(0, 100) || 'Direct',
                        inline: true
                    },
                    {
                        name: 'Page',
                        value: pageData.page,
                        inline: true
                    }
                ],
                timestamp: pageData.timestamp
            }]
        })
    }).catch(() => {}); // Silently fail
});


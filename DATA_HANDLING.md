# Data Handling Policy

## Overview

This document explains how Nexus Bot handles, stores, and protects data.

## Data Collection

### What We Collect

**Server Data:**

- Server ID, name, and basic information
- Server configurations and settings
- Moderation logs and actions
- Security events and threat data
- **Recovery snapshots** (channel structures, role configurations, permission overwrites, webhooks, emojis, stickers, server settings including icon and banner)
- Server lockdown state (temporary, during security incidents)

**User Data:**

- User IDs (Discord snowflakes)
- Usernames (for moderation purposes)
- Moderation history
- Behavioral patterns (anonymized for AI)
- **Role and permission data** (stored in recovery snapshots for restoration purposes)
- **Whitelist data** (user IDs exempt from anti-nuke monitoring)
- **Predictive threat patterns** (behavioral patterns and confidence scores for threat prediction)

**Technical Data:**

- Command usage statistics
- Bot performance metrics (command execution times, database query performance, memory usage)
- Error logs (for debugging)
- Event processing times

### What We DON'T Collect

- Email addresses
- Phone numbers
- Payment information
- Personal messages (unless reported for moderation)
- Voice chat data
- Location data

## Data Storage

### Storage Location

- All data stored on secure servers
- Database encrypted at rest
- No cloud storage of sensitive data
- Regular backups

### Storage Duration

**Active Servers:**

- Data retained while bot is in server
- Deleted 30 days after bot removal

**Inactive Servers (Bot Removed):**

- Configurations: Deleted 30 days after bot removal
- Moderation logs: 90 days (configurable per server, minimum 30 days)
- **Recovery snapshots**: Deleted 30 days after bot removal (90 days retention while bot is active)
- **Whitelist data**: Deleted 30 days after bot removal
- **Predictive threat patterns**: 90 days (anonymized after 30 days, deleted 30 days after bot removal)
- Logs (other): 30 days
- Analytics: 1 year (anonymized after 90 days)
- **Performance metrics**: 90 days (deleted 30 days after bot removal)
- Threat intelligence: 30 days
- **Security logs with threat types**: 90 days (includes threat classification and actions taken)

## Data Usage

### Security & Moderation

- Detect and prevent attacks
- Moderate content
- Track threats
- Share anonymized threat intelligence
- **Auto-recovery**: Create snapshots of server structure to restore after attacks
- **Server lockdown**: Temporarily restrict server access during security incidents
- **Spam detection**: Monitor and remove spam channels and messages

### AI Features

- Server-specific machine learning
- Behavioral pattern analysis
- Threat prediction
- Security recommendations

### Service Improvement

- Fix bugs
- Improve performance
- Add features
- Generate statistics

## Data Sharing

### Threat Intelligence Network:

We share threat intelligence data across servers to protect communities:

**What is Shared:**

- User IDs (Discord snowflakes) - To identify reported threats
- Threat type and severity
- Source guild ID - For verification purposes
- Threat metadata (contextual information)

**What is NOT Shared:**

- Server names or configurations
- Full moderation logs
- Message content
- User usernames (only IDs)
- Non-threat-related data

**Purpose:** Network security and threat prevention

**Your Control:** You can opt-out of threat intelligence sharing via bot configuration

### Aggregate Statistics:

- **Aggregate statistics only** - No personal information
- Anonymized usage patterns
- Overall bot performance metrics

### We DON'T Share:

- Personal user information for commercial purposes
- Server-specific configuration data
- Full moderation logs
- Private messages
- Email addresses or contact information
- Payment information (we don't collect this)

## Data Security

### Measures

- Encrypted database
- Secure servers
- Access controls
- Regular security audits
- No third-party data sharing

### Breach Response

- Immediate investigation
- Notification within 72 hours
- Data breach reporting
- Remediation steps

## User Rights

### Access

- Request your server's data
- View stored information
- Export data (JSON format)

### Deletion

- Request data deletion
- Automatic deletion after bot removal
- Right to be forgotten (GDPR)

### Control

- Configure data collection
- Opt-out of analytics
- Disable threat sharing
- Customize retention

## Compliance

### UK GDPR

- Right to access
- Right to deletion (Right to be forgotten)
- Right to data portability
- Right to object
- Right to rectification
- Right to restrict processing
- Compliance with UK Data Protection Act 2018

### EU GDPR

- Full GDPR compliance for EU users
- All data subject rights as above
- Cross-border data transfer safeguards

### CCPA (California)

- Right to know
- Right to delete
- Right to opt-out
- Non-discrimination

### Discord ToS

- Compliant with Discord's Terms of Service
- Follows Discord's API guidelines
- Respects user privacy

## Open Source Transparency

Since Nexus Bot is open source:

- Code is publicly available
- Data handling is transparent
- You can verify our practices
- Community can audit code

## Third-Party Services

### Discord API

- We use Discord's API as permitted by Discord's Terms of Service
- Data processing follows Discord's API guidelines

### Hosting Providers

- Secure hosting with industry-standard security
- Data protection agreements in place
- Encrypted storage and transmission

### No Other Third Parties

- No analytics platforms (Google Analytics, etc.)
- No advertising networks
- No data brokers or resellers

## AI and Machine Learning Processing

### Server-Specific AI

- AI models trained on your server's data only
- No cross-server training data mixing
- Models stay within your server's context

### Aggregated Analytics

- Anonymized, aggregated data may be used for general improvements
- No personal identifiers in aggregated data
- You can opt-out of AI features

### Automated Decisions

- AI may make automated decisions (threat scoring, recommendations)
- You can request human review (GDPR right)
- Final decisions are your responsibility as administrator

## Contact

For data-related questions, data requests, or concerns:

- **Discord Support Server:** https://discord.gg/UHNcUKheZP (Preferred method)
- **Privacy Email:** ashlynnadams635@gmail.com (For formal data requests)
- **General Contact:** Open a ticket in our support server
- **GitHub:** https://github.com/Azzraya/Nexus (For code-related questions)

**UK Data Protection Authority:**

- Information Commissioner's Office (ICO): https://ico.org.uk/make-a-complaint/
- If you are in the EU, contact your local data protection authority

## Auto-Recovery Snapshots

### What Data is Stored:

Recovery snapshots contain complete server structure data:

- **Channel Data**: IDs, names, types, positions, parent categories, and permission overwrites (including role/user IDs and specific permissions)
- **Role Data**: IDs, names, colors, permissions, positions, mentionable status, and hoist settings
- **Permission Overwrites**: Detailed permission settings for channels
- **Webhook Data**: Webhook IDs, names, channel associations, and avatars (for restoration purposes)
- **Emoji Data**: Emoji IDs, names, animated status, and image URLs (for restoration purposes)
- **Sticker Data**: Sticker IDs, names, descriptions, formats, and image URLs (for restoration purposes)
- **Server Settings**: Server name, description, icon, banner, splash, verification level, notification settings, AFK settings, system channels, and locale preferences

### When Snapshots are Created:

- Automatically when the bot joins your server (initial snapshot)
- Periodically (every 24 hours if no recent snapshot exists)
- Before and after security incidents
- On-demand via commands (if available)

### Retention:

- **Active servers**: Snapshots retained for 90 days
- **After bot removal**: Snapshots deleted 30 days after bot removal
- Old snapshots are automatically purged to maintain database size

### Purpose:

- Restore deleted channels and roles after nuke attacks
- Recover server structure and permissions
- Restore webhooks, emojis, and stickers when available
- Restore server settings (icon, banner, verification level, etc.)
- Maintain server functionality after security incidents

### Security:

- Snapshots stored in encrypted database
- Only accessible to the bot for recovery purposes
- Not shared with third parties
- Contains server structure data only (no message content)

## Version History

- **December 1, 2025** - Added enhanced recovery features (webhooks, emojis, stickers, server settings), whitelist system, predictive threat detection, parallel processing optimizations
- **December 1, 2025** - Added auto-recovery snapshots documentation, performance metrics, enhanced security logging, server lockdown features
- **December 1, 2025** - Updated data sharing disclosure, added threat intelligence details, added AI processing information
- **November 30, 2025** - Initial version

---

_Data Handling Policy - Last Updated: December 1, 2025_

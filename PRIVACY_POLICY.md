# Privacy Policy

**Last Updated: December 1, 2025**

## Introduction

Nexus Bot ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect information when you use Nexus Bot on Discord.

## Information We Collect

### Server Information

- Server ID
- Server name
- Server settings and configurations
- Moderation logs and actions
- Security events and threat data
- **Recovery snapshots** (channel structures, role configurations, permission overwrites, webhooks, emojis, stickers, server settings including icon and banner)
- Server lockdown state (temporary, during security incidents)

### User Information

- User IDs (Discord snowflakes)
- Usernames and discriminators
- Messages (for moderation purposes only)
- Moderation history
- Behavioral patterns (for threat detection)
- **Role and permission data** (stored in recovery snapshots for restoration purposes)
- **Whitelist data** (user IDs exempt from anti-nuke monitoring)
- **Predictive threat patterns** (behavioral patterns and confidence scores for threat prediction)

### Technical Information

- Command usage statistics
- Bot performance metrics (command execution times, database query performance, memory usage)
- Error logs
- API usage data
- Event processing times

## How We Use Information

### Security & Moderation

- Detect and prevent raids, nukes, and other attacks
- Moderate server content
- Track user behavior for threat detection
- Share threat intelligence across servers (see "Threat Intelligence Network" section below)
- **Auto-recovery**: Create snapshots of server structure (channels, roles, permissions) to restore after attacks
- **Server lockdown**: Temporarily restrict server access during security incidents
- **Spam detection**: Monitor and remove spam channels and messages

### Service Improvement

- Analyze bot performance
- Fix bugs and errors
- Improve features
- Generate statistics and reports

### AI Features

- Train machine learning models (server-specific)
- Generate security recommendations
- Analyze behavioral patterns
- Predict potential threats

## Data Storage

### Location

- All data is stored locally on our servers
- Database is encrypted at rest
- No third-party data sharing

### Retention

- Server configurations: Until server removes bot (deleted 30 days after removal)
- Moderation logs: 90 days (configurable per server)
- **Recovery snapshots**: 90 days (automatically created periodically and before/after security incidents)
- Analytics: 1 year (anonymized after 90 days)
- Threat intelligence: 30 days
- **Performance metrics**: 90 days (command times, query performance, memory usage)
- Message content: Not stored permanently (only processed in real-time for moderation)
- Behavioral patterns: 90 days (anonymized after 30 days)
- **Security logs with threat types**: 90 days (includes threat classification and actions taken)
- **Whitelist data**: Retained while bot is in server, deleted 30 days after bot removal
- **Predictive threat patterns**: 90 days (anonymized after 30 days)

## Auto-Recovery System

Nexus Bot includes an automatic server recovery system that creates snapshots of your server's structure to restore it after attacks.

### What Data is Stored in Snapshots:

- **Channel Data**: Channel IDs, names, types, positions, parent categories, and permission overwrites (including role/user IDs and specific permissions)
- **Role Data**: Role IDs, names, colors, permissions, positions, mentionable status, and hoist settings
- **Permission Overwrites**: Detailed permission settings for channels, including which roles/users have specific permissions
- **Webhook Data**: Webhook IDs, names, channel associations, and avatars (for restoration purposes)
- **Emoji Data**: Emoji IDs, names, animated status, and image URLs (for restoration purposes)
- **Sticker Data**: Sticker IDs, names, descriptions, formats, and image URLs (for restoration purposes)
- **Server Settings**: Server name, description, icon, banner, splash, verification level, notification settings, AFK settings, system channels, and locale preferences

### Purpose:

- Restore deleted channels and roles after nuke attacks
- Recover server structure and permissions
- Maintain server functionality after security incidents

### Retention:

- Snapshots are automatically created:
  - When the bot joins your server (initial snapshot)
  - Periodically (every 24 hours if no recent snapshot exists)
  - Before and after security incidents
- Snapshots are retained for **90 days**
- Snapshots are automatically deleted 30 days after bot removal from server

### Your Control:

- Snapshots are created automatically for security purposes
- You cannot disable snapshot creation (required for auto-recovery)
- You can request deletion of specific snapshots via support
- All snapshots are deleted when the bot is removed from your server

### Data Security:

- Snapshots are stored in encrypted database
- Only accessible to the bot for recovery purposes
- Not shared with third parties
- Contains server structure data only (no message content)

## Data Sharing

### We Do NOT:

- Sell your data to third parties
- Share personal information for commercial purposes
- Use data for advertising
- Share data with other Discord bots or services (except threat intelligence network as described below)

### We DO:

- Share threat intelligence data across servers through our Threat Intelligence Network (see section below)
- Use data for bot functionality and security features
- Store data securely on our servers

## Threat Intelligence Network

Our Threat Intelligence Network is a security feature that allows servers to share threat information to protect against malicious users.

### What Data is Shared:

- **User IDs (Discord snowflakes)** - To identify users who have been reported as threats
- **Threat type** - The category of threat (raid, spam, harassment, etc.)
- **Threat severity** - Risk score and severity level
- **Source guild ID** - The server that reported the threat (for verification purposes)
- **Threat metadata** - Contextual information about the threat

### What is NOT Shared:

- Server names or server-specific configurations
- Full moderation logs
- Personal messages or message content
- User usernames or display names (only user IDs)
- Non-threat-related data

### Purpose:

This data sharing allows servers to:

- Prevent known bad actors from causing harm across multiple servers
- Identify coordinated attacks and raids
- Protect communities through collective security

### Your Control:

- **Opt-Out:** You can disable threat intelligence sharing for your server via bot configuration
- **Opt-In Default:** Threat intelligence sharing is enabled by default for security
- **Data Deletion:** Threat reports are automatically deleted after 30 days

### Legal Basis (GDPR):

We process threat intelligence data under **legitimate interest** for the purpose of:

- Preventing fraud and criminal activity
- Protecting the security of our service and users
- Ensuring network safety

## Third-Party Services

### Discord API

Nexus Bot uses Discord's API and services. By using Discord, you are also subject to Discord's Privacy Policy and Terms of Service. We access and process Discord data only as permitted by Discord's API Terms of Service.

### Hosting Services

We use secure hosting providers to store and process your data. All hosting providers are bound by strict data protection agreements and industry-standard security practices.

### No Other Third Parties

We do not share your data with any other third-party services, analytics platforms, advertising networks, or data brokers.

## Cookies and Tracking Technologies

Nexus Bot does not use cookies or tracking technologies in the Discord application itself. If you access a web dashboard (if provided), standard session cookies may be used for authentication purposes only.

## AI and Machine Learning

### Data Processing

Our AI features use machine learning to:

- Analyze behavioral patterns for threat detection
- Generate security recommendations
- Predict potential security risks

### Training Data

- **Server-Specific Models:** AI models are trained on data from your server only, not other servers
- **Aggregated Analytics:** Anonymized, aggregated statistics may be used for general model improvement
- **No Personal Data:** No personally identifiable information is used in model training
- **User Control:** You can disable AI features via bot configuration

### Automated Decision-Making

AI features may make automated decisions such as:

- Threat risk scoring
- Moderation recommendations
- Security alerts

**Your Rights:**

- Request human review of automated decisions (GDPR Article 22)
- Opt-out of AI-based features
- Receive explanations of automated decisions

## Data Portability

You have the right to request your data in a portable format.

### How to Request:

1. Join our support server: https://discord.gg/UHNcUKheZP
2. Open a ticket or contact a moderator
3. Specify what data you'd like exported

### Timeline:

- **Standard Request:** Within 30 days (GDPR requirement)
- **Complex Request:** May take up to 60 days with notification

### Format:

Data will be provided in JSON format including:

- Server configurations
- Moderation logs
- User data (if applicable)
- Analytics data
- **Recovery snapshots** (if requested)
- **Performance metrics** (if requested)
- **Security logs** (if requested)

## International Data Transfers

### Data Storage Location

Your data is stored on secure servers. If your data is stored outside the United Kingdom, appropriate safeguards are in place to protect your data in accordance with UK GDPR requirements.

### UK GDPR and EU GDPR Compliance

If you are in the United Kingdom or European Union:

- We are compliant with UK GDPR and EU GDPR regulations
- We provide appropriate safeguards for international data transfers
- You maintain all GDPR rights regardless of data location
- Standard Contractual Clauses may apply to data transfers where necessary
- Data transfers are made in accordance with UK and EU data protection laws

## Legal Basis for Processing (GDPR)

We process your personal data under the following legal bases:

- **Contract Performance:** To provide bot services and features you've requested
- **Legitimate Interest:** For security, threat detection, and service improvement
- **Consent:** For optional features like analytics (can be disabled)
- **Legal Obligation:** To comply with legal requirements and prevent illegal activity

## Your Rights

### Access (Right to Know)

- Request a copy of all data we have about your server
- Receive information about data processing activities
- Know what data is shared and with whom
- **Timeline:** Within 30 days of request (GDPR)

### Deletion (Right to be Forgotten)

- Request deletion of your server's data
- Request deletion of your user data
- Remove bot from server (data deleted automatically after 30 days)
- **Timeline:** Within 30 days of request (GDPR)
- **Exceptions:** We may retain certain data if required by law

### Rectification (Right to Correct)

- Request correction of inaccurate data
- Update server configurations
- **Timeline:** Within 30 days of request (GDPR)

### Portability (Right to Data Portability)

- Receive your data in a structured, machine-readable format
- Transfer your data to another service
- See "Data Portability" section above for details

### Objection (Right to Object)

- Object to processing based on legitimate interests
- Opt-out of automated decision-making
- Request human review of AI decisions

### Restriction (Right to Restrict Processing)

- Request temporary restriction of data processing
- While investigating data accuracy or objection claims

### Control

- Configure what data is collected via bot settings
- Opt-out of threat intelligence sharing
- Disable analytics and AI features
- Customize data retention periods (where applicable)

## Security

### Measures

- Encrypted database storage
- Secure server infrastructure
- Regular security audits
- Access controls and authentication

### Breach Notification

If a data breach occurs that may affect your privacy:

- **Timeline:** We will notify affected servers within 72 hours of discovery (GDPR requirement)
- **Method:**
  - Discord direct message to server administrators
  - Announcement in our support server
  - Email (if provided)
- **Information Provided:**
  - Description of the breach
  - Types of data potentially affected
  - Steps we're taking to address it
  - Recommendations for users
  - Contact information for questions
- **Regulatory Reporting:** We will report breaches to relevant data protection authorities as required by law

## Open Source

Nexus Bot is open source. You can:

- View our code
- See exactly how data is handled
- Contribute improvements
- Verify our privacy practices

## Children's Privacy (COPPA Compliance)

Nexus Bot is not intended for users under 13 years of age (Discord's minimum age requirement).

### Our Policy:

- We do not knowingly collect data from users under 13
- We comply with the Children's Online Privacy Protection Act (COPPA)
- If we discover we have collected data from a user under 13, we will:
  - Immediately delete all associated data
  - Notify the server administrator
  - Take steps to prevent future collection

### Reporting:

If you believe we have collected data from a user under 13:

1. Contact us immediately via our support server
2. Provide the user ID or relevant information
3. We will investigate and delete the data within 24 hours

## Changes to This Policy

We may update this Privacy Policy from time to time. We will:

- Notify servers of significant changes
- Update the "Last Updated" date
- Post changes in our support server

## Version History

- **December 1, 2025** - Added enhanced recovery features (webhooks, emojis, stickers, server settings), whitelist system, predictive threat detection documentation
- **December 1, 2025** - Added auto-recovery snapshots documentation, performance metrics, enhanced security logging, server lockdown features
- **December 1, 2025** - Initial comprehensive privacy policy with GDPR, CCPA, and Discord ToS compliance

## Contact

For privacy concerns, data requests, or questions:

- **Discord Support Server:** https://discord.gg/UHNcUKheZP (Preferred method)
- **Privacy Email:** ashlynnadams635@gmail.com (For formal privacy requests)
- **General Contact:** Open a ticket in our support server
- **GitHub Issues:** https://github.com/Azzraya/Nexus/issues (For code-related questions)

### Data Protection Officer and ICO

If you are in the UK or EU and have GDPR-related concerns, you can:

- Contact us via the methods above
- Contact the UK Information Commissioner's Office (ICO) if you are in the UK: https://ico.org.uk/make-a-complaint/
- Contact your local data protection authority if you are in the EU

## Compliance

### UK GDPR and EU GDPR

We are compliant with both UK GDPR and the EU's General Data Protection Regulation:

- ✅ Full data subject rights (access, deletion, portability, etc.)
- ✅ Lawful basis for processing disclosed
- ✅ Data breach notification procedures
- ✅ International transfer safeguards
- ✅ Data Protection Impact Assessments (where required)
- ✅ Compliance with UK Data Protection Act 2018

### CCPA/CPRA (California Consumer Privacy Act)

We are compliant with California privacy laws:

- ✅ "Do Not Sell" - We do not sell your personal information
- ✅ Right to know what data is collected
- ✅ Right to delete personal information
- ✅ Right to opt-out of data sharing
- ✅ Non-discrimination for exercising privacy rights

### Discord ToS Compliance

- ✅ Follows Discord's Terms of Service
- ✅ Complies with Discord API Terms
- ✅ Respects Discord's Privacy Policy requirements
- ✅ Age restrictions (13+ per Discord requirements)

---

**By using Nexus Bot, you agree to this Privacy Policy.**

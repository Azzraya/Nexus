# Contributing to Nexus Bot

Thank you for your interest in contributing to Nexus Bot! 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)

## Code of Conduct

This project follows a Code of Conduct that all contributors are expected to adhere to:

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards others

## How to Contribute

There are many ways to contribute to Nexus Bot:

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/your-repo/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (OS, Node version, etc.)
   - Screenshots if applicable

### Suggesting Features

1. Check if the feature has been suggested in [Issues](https://github.com/your-repo/issues)
2. Create a new issue with:
   - Clear description of the feature
   - Use case and benefits
   - Potential implementation approach
   - Any alternatives you've considered

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Make your changes
4. Write/update tests
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
7. Push to your branch (`git push origin feature/AmazingFeature`)
8. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- SQLite3
- A Discord bot application (from Discord Developer Portal)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/nexus-bot.git
cd nexus-bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your bot token and configuration
nano .env

# Start development (database auto-initializes on first run)
npm run dev
```

### Project Structure

```
nexus-bot/
├── commands/          # Slash commands
├── events/           # Discord event handlers
├── utils/            # Utility functions & systems
├── dashboard/        # Web dashboard
├── docs/             # Documentation website
├── tests/            # Test files
└── index.js          # Main entry point
```

## Pull Request Process

1. **Update Documentation**: Ensure all new features are documented
2. **Update Tests**: Add/update tests for your changes
3. **Update Changelog**: Add your changes to `docs/changelog.html`
4. **Follow Coding Standards**: Ensure your code follows our style guide
5. **Pass All Checks**: All automated tests must pass
6. **Get Reviews**: At least one maintainer must approve your PR

### PR Title Format

Use conventional commits format:

- `feat: Add new command`
- `fix: Resolve database connection issue`
- `docs: Update README`
- `test: Add unit tests for automod`
- `refactor: Improve performance of cache system`

## Coding Standards

### JavaScript Style

- Use ES6+ features
- Use `const` by default, `let` when reassignment needed
- Never use `var`
- Use template literals for string concatenation
- Use arrow functions for callbacks
- Use async/await over Promise chains

### Naming Conventions

- `camelCase` for variables and functions
- `PascalCase` for classes
- `UPPER_SNAKE_CASE` for constants
- Descriptive names over abbreviations

### Comments

- Use JSDoc for function documentation
- Comment complex logic
- Don't comment obvious code
- Keep comments up-to-date

Example:

```javascript
/**
 * Calculate server security score
 * @param {string} guildId - Discord guild ID
 * @param {Object} config - Server configuration
 * @returns {Promise<number>} Security score (0-100)
 */
async function calculateSecurityScore(guildId, config) {
  // Implementation
}
```

### Error Handling

- Always handle errors gracefully
- Use try/catch for async operations
- Log errors with context
- Provide user-friendly error messages

### Database Operations

- Use prepared statements to prevent SQL injection
- Use transactions for multiple related operations
- Always close database connections
- Handle connection errors

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/automod.test.js

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Writing Tests

- Write tests for all new features
- Aim for >80% code coverage
- Test edge cases and error conditions
- Use descriptive test names

Example:

```javascript
describe("AutoMod System", () => {
  test("should detect spam messages", async () => {
    const message = createMockMessage("spam spam spam");
    const result = await automod.checkMessage(message);
    expect(result.isSpam).toBe(true);
  });

  test("should handle database errors gracefully", async () => {
    // Simulate database error
    db.get = jest.fn().mockRejectedValue(new Error("DB Error"));
    const result = await automod.getConfig("123");
    expect(result).toBe(null);
  });
});
```

## Feature Guidelines

### What We Accept

- **Bug fixes** - Always welcome!
- **Performance improvements** - Backed by benchmarks
- **Security enhancements** - Critical priority
- **New features** - Must align with bot's mission
- **Documentation** - Greatly appreciated
- **Tests** - More coverage is always good

### What We Don't Accept

- **Breaking changes** - Unless absolutely necessary
- **Paywalled features** - All functionality must be free
- **Telemetry/tracking** - Privacy is important
- **Bloat** - Keep dependencies minimal
- **Duplicate features** - Check existing functionality first

## Premium/Paid Features Policy

**IMPORTANT**: Nexus Bot is committed to keeping ALL functional features free.

### ✅ Acceptable Premium Features

- Cosmetic customizations (badges, colors, themes)
- Early access to cosmetic features
- Supporter recognition
- Priority support response times

### ❌ NOT Acceptable Premium Features

- Locking commands behind a paywall
- Limiting server protection features
- Restricting moderation tools
- Any functional limitation

If you're unsure whether a feature should be premium, ask first!

## Questions?

- Open an issue for general questions
- Join our Discord server for real-time chat
- Email maintainers for security issues

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

---

Thank you for making Nexus Bot better! 💙

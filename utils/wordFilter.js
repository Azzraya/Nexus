const logger = require("./logger");

/**
 * Advanced Word Filter System
 * Detects blacklisted words with various obfuscation attempts:
 * - Spacing variations (b a d w o r d)
 * - CamelCase/PascalCase (BadWord, badWord)
 * - Mixed case (BaDwOrD)
 * - Zero-width characters
 * - Unicode variations
 * - Leetspeak (b4dw0rd)
 * - Repeated characters (baaadword)
 */
class WordFilter {
  constructor() {
    this.cache = new Map(); // Cache compiled patterns per guild

    // Default blacklist of offensive terms and slurs (always checked)
    this.defaultBlacklist = [
      // Racial slurs
      "nigger",
      "nigga",
      "n1gger",
      "n1gga",
      "nigg3r",
      "nigg4",
      "chink",
      "spic",
      "kike",
      "wetback",
      "gook",
      "towelhead",
      "sandnigger",
      "sandnigga",
      // Homophobic slurs
      "faggot",
      "fag",
      "fagg",
      "f4ggot",
      "f4g",
      "queer",
      "dyke",
      "tranny",
      "trap",
      // Ableist slurs
      "retard",
      "retarded",
      "r3tard",
      "r3tarded",
      "autistic",
      "spastic",
      "spaz",
      // Other offensive terms
      "whore",
      "slut",
      "bitch",
      "cunt",
      "pussy",
      "dickhead",
      "asshole",
      "motherfucker",
      "motherfuck",
      // Hate symbols/terms
      "nazi",
      "hitler",
      "holocaust",
      "kkk",
      "white power",
      "heil hitler",
      // Extreme violence
      "kill yourself",
      "kys",
      "kms",
      "suicide",
      "self harm",
    ];
  }

  /**
   * Normalize text by removing obfuscation attempts including font variations
   * @param {string} text - Text to normalize
   * @returns {string} - Normalized text
   */
  normalizeText(text) {
    if (!text || typeof text !== "string") return "";

    // Remove zero-width characters
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Normalize Unicode font variations to ASCII
    text = this.normalizeFonts(text);

    // Remove spacing variations (keep only single spaces)
    text = text.replace(/\s+/g, "");

    // Convert to lowercase for comparison
    text = text.toLowerCase();

    // Remove common leetspeak substitutions
    const leetMap = {
      0: "o",
      1: "i",
      3: "e",
      4: "a",
      5: "s",
      7: "t",
      "@": "a",
      "!": "i",
      $: "s",
      "#": "h",
    };

    // Replace leetspeak characters
    for (const [leet, normal] of Object.entries(leetMap)) {
      text = text.replace(new RegExp(leet, "gi"), normal);
    }

    // Remove repeated characters (more than 2 in a row)
    text = text.replace(/(.)\1{2,}/g, "$1$1");

    // Remove special characters that might be used for obfuscation
    text = text.replace(/[^\w\s]/g, "");

    return text;
  }

  /**
   * Normalize Unicode font variations to ASCII equivalents
   * Handles various Unicode blocks that look like ASCII characters
   * @param {string} text - Text with potential font variations
   * @returns {string} - Text normalized to ASCII
   */
  normalizeFonts(text) {
    if (!text || typeof text !== "string") return "";

    let normalized = text;

    // Fullwidth characters (全角) - U+FF00 to U+FFEF
    // Convert fullwidth to ASCII
    normalized = normalized.replace(/[\uFF00-\uFFEF]/g, (char) => {
      const code = char.charCodeAt(0);
      // Fullwidth ASCII range: 0xFF00-0xFF5E maps to 0x0020-0x007E
      if (code >= 0xff01 && code <= 0xff5e) {
        return String.fromCharCode(code - 0xff00 + 0x0020);
      }
      return char;
    });

    // Mathematical Bold (U+1D400-1D433 uppercase, U+1D41A-1D433 lowercase)
    // Handle surrogate pairs correctly - match high surrogate then low surrogate range
    normalized = normalized.replace(/[\uD835][\uDC00-\uDC33]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      if (code >= 0x1d400 && code <= 0x1d433) {
        return String.fromCharCode(code - 0x1d400 + 65); // A-Z
      } else if (code >= 0x1d41a && code <= 0x1d433) {
        return String.fromCharCode(code - 0x1d41a + 97); // a-z
      }
      return match;
    });

    // Mathematical Italic (U+1D434-1D44D uppercase, U+1D44E-1D467 lowercase)
    normalized = normalized.replace(/[\uD835][\uDC34-\uDC67]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      if (code >= 0x1d434 && code <= 0x1d44d) {
        return String.fromCharCode(code - 0x1d434 + 65); // A-Z
      } else if (code >= 0x1d44e && code <= 0x1d467) {
        return String.fromCharCode(code - 0x1d44e + 97); // a-z
      }
      return match;
    });

    // Circled Latin (U+24B6-24E9 for A-Z, a-z)
    normalized = normalized.replace(/[\u24B6-\u24E9]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x24b6 && code <= 0x24cf) {
        return String.fromCharCode(code - 0x24b6 + 65); // A-Z
      } else if (code >= 0x24d0 && code <= 0x24e9) {
        return String.fromCharCode(code - 0x24d0 + 97); // a-z
      }
      return char;
    });

    // Parenthesized Latin (U+249C-24B5 for a-z)
    normalized = normalized.replace(/[\u249C-\u24B5]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x249c && code <= 0x24b5) {
        return String.fromCharCode(code - 0x249c + 97); // a-z
      }
      return char;
    });

    // Squared Latin (U+1F130-1F149 for A-Z) - These are surrogate pairs
    normalized = normalized.replace(/\uD83C[\uDD30-\uDD49]/g, (match) => {
      // Handle surrogate pairs for squared characters
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      if (high === 0xd83c && low >= 0xdd30 && low <= 0xdd49) {
        return String.fromCharCode(low - 0xdd30 + 65); // A-Z
      }
      return match;
    });

    // Mathematical Script (U+1D49C-1D4CF uppercase, U+1D4D0-1D503 lowercase)
    normalized = normalized.replace(/[\uD835][\uDC9C-\uDD03]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      if (code >= 0x1d49c && code <= 0x1d4cf) {
        return String.fromCharCode(code - 0x1d49c + 65); // A-Z
      } else if (code >= 0x1d4d0 && code <= 0x1d503) {
        return String.fromCharCode(code - 0x1d4d0 + 97); // a-z
      }
      return match;
    });

    // Mathematical Fraktur (U+1D504-1D537 uppercase, U+1D538-1D56B lowercase)
    normalized = normalized.replace(/[\uD835][\uDD04-\uDD6B]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      if (code >= 0x1d504 && code <= 0x1d537) {
        return String.fromCharCode(code - 0x1d504 + 65); // A-Z
      } else if (code >= 0x1d538 && code <= 0x1d56b) {
        return String.fromCharCode(code - 0x1d538 + 97); // a-z
      }
      return match;
    });

    // Double-struck (U+1D538-1D56B uppercase, U+1D552-1D585 lowercase)
    normalized = normalized.replace(/[\uD835][\uDD38-\uDD6B]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      if (code >= 0x1d538 && code <= 0x1d56b) {
        return String.fromCharCode(code - 0x1d538 + 65); // A-Z
      } else if (code >= 0x1d552 && code <= 0x1d585) {
        return String.fromCharCode(code - 0x1d552 + 97); // a-z
      }
      return match;
    });

    return normalized;
  }

  /**
   * Generate all possible variations of a word for pattern matching
   * @param {string} word - Word to generate variations for
   * @returns {Array<string>} - Array of variation patterns
   */
  generateVariations(word) {
    if (!word || typeof word !== "string") return [];

    const variations = new Set();
    const normalized = word.toLowerCase().trim();

    if (!normalized) return [];

    // Add base word
    variations.add(normalized);

    // Add with spaces between each character
    variations.add(normalized.split("").join(" "));
    variations.add(normalized.split("").join("  ")); // Double space

    // Add CamelCase variations
    const camelCase =
      normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    variations.add(camelCase);

    // Add PascalCase (same as CamelCase for single word)
    variations.add(camelCase);

    // Add alternating case
    let alternating = "";
    for (let i = 0; i < normalized.length; i++) {
      alternating += i % 2 === 0 ? normalized[i].toUpperCase() : normalized[i];
    }
    variations.add(alternating);

    // Add all uppercase
    variations.add(normalized.toUpperCase());

    // Add with common separators
    const separators = ["-", "_", ".", "|"];
    for (const sep of separators) {
      variations.add(normalized.split("").join(sep));
    }

    // Add leetspeak variations (common substitutions)
    const leetVariations = [
      normalized.replace(/a/gi, "4"),
      normalized.replace(/e/gi, "3"),
      normalized.replace(/i/gi, "1"),
      normalized.replace(/o/gi, "0"),
      normalized.replace(/s/gi, "5"),
      normalized.replace(/t/gi, "7"),
    ];
    leetVariations.forEach((v) => variations.add(v));

    return Array.from(variations);
  }

  /**
   * Check if text contains any blacklisted word (with variations)
   * @param {string} text - Text to check
   * @param {Array<string>} blacklist - Array of blacklisted words (server-specific, optional)
   * @param {boolean} includeDefault - Whether to include default blacklist (default: true)
   * @returns {Object} - { detected: boolean, word: string|null, method: string, isDefault: boolean }
   */
  checkText(text, blacklist = [], includeDefault = true) {
    // Combine default blacklist with server-specific blacklist
    const combinedBlacklist = includeDefault
      ? [...this.defaultBlacklist, ...(blacklist || [])]
      : blacklist || [];

    if (!text || combinedBlacklist.length === 0) {
      return { detected: false, word: null, method: null, isDefault: false };
    }

    // Normalize the input text
    const normalizedText = this.normalizeText(text);
    const originalLower = text.toLowerCase();

    // Check each blacklisted word
    for (const word of combinedBlacklist) {
      if (!word || typeof word !== "string") continue;

      const normalizedWord = word.toLowerCase().trim();
      if (!normalizedWord) continue;

      // Check if this is from default blacklist
      const isDefault = this.defaultBlacklist.includes(word);

      // Method 1: Direct match in normalized text
      if (normalizedText.includes(normalizedWord)) {
        return {
          detected: true,
          word: word,
          method: "normalized_match",
          isDefault: isDefault,
        };
      }

      // Method 2: Check original text with case variations
      const caseInsensitiveRegex = new RegExp(
        normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      if (caseInsensitiveRegex.test(text)) {
        return {
          detected: true,
          word: word,
          method: "case_insensitive",
          isDefault: isDefault,
        };
      }

      // Method 3: Check with spacing variations
      const spacedPattern = normalizedWord.split("").join("\\s*");
      const spacedRegex = new RegExp(spacedPattern, "i");
      if (spacedRegex.test(text)) {
        return {
          detected: true,
          word: word,
          method: "spacing_variation",
          isDefault: isDefault,
        };
      }

      // Method 4: Check CamelCase/PascalCase
      const camelPattern =
        normalizedWord.charAt(0).toUpperCase() +
        normalizedWord.slice(1).toLowerCase();
      if (
        text.includes(camelPattern) ||
        text.includes(normalizedWord.toUpperCase())
      ) {
        return {
          detected: true,
          word: word,
          method: "case_variation",
          isDefault: isDefault,
        };
      }

      // Method 5: Check with common separators
      const separators = ["-", "_", ".", "|"];
      for (const sep of separators) {
        const separated = normalizedWord.split("").join(sep);
        if (originalLower.includes(separated)) {
          return {
            detected: true,
            word: word,
            method: "separator_variation",
            isDefault: isDefault,
          };
        }
      }

      // Method 6: Check leetspeak variations
      const leetPatterns = [
        normalizedWord.replace(/a/g, "[4@]"),
        normalizedWord.replace(/e/g, "[3]"),
        normalizedWord.replace(/i/g, "[1!]"),
        normalizedWord.replace(/o/g, "[0]"),
        normalizedWord.replace(/s/g, "[5$]"),
        normalizedWord.replace(/t/g, "[7]"),
      ];

      for (const pattern of leetPatterns) {
        try {
          const leetRegex = new RegExp(pattern, "i");
          if (leetRegex.test(text)) {
            return {
              detected: true,
              word: word,
              method: "leetspeak",
              isDefault: isDefault,
            };
          }
        } catch (e) {
          // Invalid regex, skip
        }
      }

      // Method 7: Check with repeated characters removed
      const deduplicated = normalizedWord.replace(/(.)\1+/g, "$1");
      if (normalizedText.includes(deduplicated) && normalizedWord.length > 3) {
        // Only flag if word is long enough (avoid false positives)
        return {
          detected: true,
          word: word,
          method: "repeated_chars",
          isDefault: isDefault,
        };
      }

      // Method 8: Check font variations (normalize both text and word, then compare)
      const normalizedWordFonts = this.normalizeFonts(normalizedWord);
      const normalizedTextFonts = this.normalizeFonts(text);
      if (
        normalizedTextFonts
          .toLowerCase()
          .includes(normalizedWordFonts.toLowerCase())
      ) {
        return {
          detected: true,
          word: word,
          method: "font_variation",
          isDefault: isDefault,
        };
      }
    }

    return { detected: false, word: null, method: null, isDefault: false };
  }

  /**
   * Get cached patterns for a guild (performance optimization)
   * @param {string} guildId - Guild ID
   * @param {Array<string>} blacklist - Current blacklist
   * @returns {Array<RegExp>} - Compiled regex patterns
   */
  getCachedPatterns(guildId, blacklist) {
    const cacheKey = `${guildId}-${JSON.stringify(blacklist)}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const patterns = [];
    for (const word of blacklist) {
      if (!word || typeof word !== "string") continue;
      const normalized = word.toLowerCase().trim();
      if (!normalized) continue;

      // Create pattern that matches with spacing
      const spacedPattern = normalized.split("").join("\\s*");
      try {
        patterns.push(new RegExp(spacedPattern, "i"));
      } catch (e) {
        // Invalid pattern, skip
      }
    }

    // Cache for 5 minutes
    this.cache.set(cacheKey, patterns);
    setTimeout(() => this.cache.delete(cacheKey), 5 * 60 * 1000);

    return patterns;
  }

  /**
   * Clean up old cache entries
   */
  cleanup() {
    // Cache auto-expires, but we can manually clean if needed
    if (this.cache.size > 1000) {
      // Clear half the cache if it gets too large
      const entries = Array.from(this.cache.entries());
      this.cache.clear();
      // Keep most recent 500
      entries.slice(-500).forEach(([key, value]) => {
        this.cache.set(key, value);
      });
    }
  }
}

module.exports = new WordFilter();

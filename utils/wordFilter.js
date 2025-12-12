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
      "fagg0t",
      "f4gg0t",
      "queer",
      "dyke",
      "dike",
      "d1ke",
      "tranny",
      "tr4nny",
      "trap",
      "tr4p",
      "homo",
      "h0mo",
      "gaylord",
      "g4ylord",
      "lesbo",
      "l3sbo",
      "lezbo",
      "l3zbo",
      "sodomite",
      "s0domite",
      "pillowbiter",
      "p1llowbiter",
      "butt pirate",
      "buttpirate",
      "butt pirate",
      "buttpirate",
      "cock sucker",
      "cocksucker",
      "cock sucker",
      "cocksucker",
      "fruit",
      "fruitcake",
      "fruit cake",
      "twink",
      "tw1nk",
      "bear",
      "poof",
      "p00f",
      "poofter",
      "p00fter",
      "bender",
      "b3nder",
      "bent",
      "b3nt",
      "batty boy",
      "battyboy",
      "batty boy",
      "battyboy",
      "chi chi man",
      "chichiman",
      "chi chi man",
      "chichiman",
      // Transphobic slurs
      "shemale",
      "sh3male",
      "she male",
      "she male",
      "he she",
      "heshe",
      "he she",
      "heshe",
      "it",
      "it's",
      "its",
      "attack helicopter",
      "attackhelicopter",
      "attack helicopter",
      "attackhelicopter",
      "transtrender",
      "tr4nstrender",
      "transtrender",
      "tr4nstrender",
      "troon",
      "tr00n",
      "troomer",
      "tr00mer",
      "groomer",
      "gr00mer",
      "detrans",
      "d3trans",
      "detransition",
      "d3transition",
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
    text = text.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "");

    // Normalize Unicode font variations to ASCII (this also removes emojis/decorative chars)
    text = this.normalizeFonts(text);

    // Remove spacing variations (keep only single spaces)
    text = text.replace(/\s+/g, "");

    // Convert to lowercase for comparison
    text = text.toLowerCase();

    // Remove common leetspeak substitutions
    // Note: We handle ! as leetspeak for i, but also check for it as separator
    const leetMap = {
      0: "o",
      1: "i",
      3: "e",
      4: "a",
      5: "s",
      7: "t",
      "@": "a",
      "!": "i", // ! can be used as i in leetspeak
      $: "s",
      "#": "h",
    };

    // Replace leetspeak characters
    for (const [leet, normal] of Object.entries(leetMap)) {
      text = text.replace(
        new RegExp(leet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        normal
      );
    }

    // Remove repeated characters (more than 2 in a row)
    text = text.replace(/(.)\1{2,}/g, "$1$1");

    // Remove any remaining special characters that might be used for obfuscation
    // Keep only alphanumeric after all normalization
    text = text.replace(/[^\w]/g, "");

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

    // Remove non-Latin scripts FIRST (Thai, Chinese, Japanese, Arabic, etc.)
    // These are commonly used for obfuscation but should be removed entirely
    normalized = normalized.replace(/[\u0E00-\u0E7F]/g, ""); // Thai
    normalized = normalized.replace(/[\u4E00-\u9FFF]/g, ""); // CJK Unified Ideographs
    normalized = normalized.replace(/[\u3040-\u309F]/g, ""); // Hiragana
    normalized = normalized.replace(/[\u30A0-\u30FF]/g, ""); // Katakana
    normalized = normalized.replace(/[\u0600-\u06FF]/g, ""); // Arabic
    normalized = normalized.replace(/[\u0590-\u05FF]/g, ""); // Hebrew
    normalized = normalized.replace(/[\u0400-\u04FF]/g, ""); // Cyrillic (unless we want to map these)
    normalized = normalized.replace(/[\u0370-\u03FF]/g, ""); // Greek (unless we want to map these)

    // Remove emojis (before any normalization) to prevent interference
    // Most emojis are in the range U+1F300-1F9FF (D83C-D83E high surrogates)
    // Pattern: Match any high surrogate (D800-DFFF) followed by low surrogate (DC00-DFFF)
    normalized = normalized.replace(
      /[\uD800-\uDFFF][\uDC00-\uDFFF]/g,
      (match) => {
        const high = match.charCodeAt(0);
        const low = match.charCodeAt(1);
        const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        // Check if it's in emoji ranges (U+1F300-1F9FF, U+1FA00-1FAFF, etc.)
        if (
          (code >= 0x1f300 && code <= 0x1f9ff) || // Emoticons, Symbols, Pictographs
          (code >= 0x1fa00 && code <= 0x1faff) || // Symbols Extended-A
          (code >= 0x1fab0 && code <= 0x1faff) || // Symbols Extended-B/C
          (high >= 0xd83c && high <= 0xd83e) // Common emoji high surrogates
        ) {
          return ""; // Remove emoji
        }
        // For other supplementary plane chars, check if they're decorative
        // Keep mathematical/symbol characters that we handle separately
        if (code >= 0x1d400 && code <= 0x1d7ff) {
          return match; // Keep mathematical symbols (handled elsewhere)
        }
        // Remove other decorative/symbol characters
        return "";
      }
    );

    // Remove miscellaneous symbols (U+2600-26FF) - emojis, symbols
    normalized = normalized.replace(/[\u2600-\u26FF]/g, "");

    // Remove dingbats (U+2700-27BF)
    normalized = normalized.replace(/[\u2700-\u27BF]/g, "");

    // Normalize Latin Extended-A characters (diacritics) to base ASCII
    // Handles characters like Ğ (U+011E) -> G, ğ (U+011F) -> g
    normalized = normalized.replace(/[\u0100-\u017F]/g, (char) => {
      const code = char.charCodeAt(0);
      // Map to base ASCII: remove diacritics
      // A-Z with diacritics (U+0100-0105, 0106-010D, etc.) -> A-Z
      // a-z with diacritics -> a-z
      if (code >= 0x0100 && code <= 0x017f) {
        // Remove diacritics by mapping to base character
        const baseMap = {
          // A variants
          0x0100: "A",
          0x0101: "a",
          0x0102: "A",
          0x0103: "a",
          0x0104: "A",
          0x0105: "a",
          // C variants
          0x0106: "C",
          0x0107: "c",
          0x0108: "C",
          0x0109: "c",
          0x010a: "C",
          0x010b: "c",
          0x010c: "C",
          0x010d: "c",
          // D variants
          0x010e: "D",
          0x010f: "d",
          // E variants
          0x0112: "E",
          0x0113: "e",
          0x0114: "E",
          0x0115: "e",
          0x0116: "E",
          0x0117: "e",
          0x0118: "E",
          0x0119: "e",
          0x011a: "E",
          0x011b: "e",
          // G variants (including Ğ)
          0x011c: "G",
          0x011d: "g",
          0x011e: "G",
          0x011f: "g",
          0x0120: "G",
          0x0121: "g",
          0x0122: "G",
          0x0123: "g",
          // H variants
          0x0124: "H",
          0x0125: "h",
          0x0126: "H",
          0x0127: "h",
          // I variants
          0x0128: "I",
          0x0129: "i",
          0x012a: "I",
          0x012b: "i",
          0x012c: "I",
          0x012d: "i",
          0x012e: "I",
          0x012f: "i",
          0x0130: "I",
          0x0131: "i",
          // J variants
          0x0134: "J",
          0x0135: "j",
          // K variants
          0x0136: "K",
          0x0137: "k",
          // L variants
          0x0139: "L",
          0x013a: "l",
          0x013b: "L",
          0x013c: "l",
          0x013d: "L",
          0x013e: "l",
          0x013f: "L",
          0x0140: "l",
          0x0141: "L",
          0x0142: "l",
          // N variants
          0x0143: "N",
          0x0144: "n",
          0x0145: "N",
          0x0146: "n",
          0x0147: "N",
          0x0148: "n",
          0x0149: "n",
          0x014a: "N",
          0x014b: "n",
          // O variants
          0x014c: "O",
          0x014d: "o",
          0x014e: "O",
          0x014f: "o",
          0x0150: "O",
          0x0151: "o",
          0x0152: "O",
          0x0153: "o",
          0x0154: "R",
          0x0155: "r",
          0x0156: "R",
          0x0157: "r",
          0x0158: "R",
          0x0159: "r",
          // S variants
          0x015a: "S",
          0x015b: "s",
          0x015c: "S",
          0x015d: "s",
          0x015e: "S",
          0x015f: "s",
          0x0160: "S",
          0x0161: "s",
          0x0162: "T",
          0x0163: "t",
          0x0164: "T",
          0x0165: "t",
          0x0166: "T",
          0x0167: "t",
          // U variants
          0x0168: "U",
          0x0169: "u",
          0x016a: "U",
          0x016b: "u",
          0x016c: "U",
          0x016d: "u",
          0x016e: "U",
          0x016f: "u",
          0x0170: "U",
          0x0171: "u",
          0x0172: "U",
          0x0173: "u",
          // W, Y, Z variants
          0x0174: "W",
          0x0175: "w",
          0x0176: "Y",
          0x0177: "y",
          0x0178: "Y",
          0x0179: "Z",
          0x017a: "z",
          0x017b: "Z",
          0x017c: "z",
          0x017d: "Z",
          0x017e: "z",
          0x017f: "s",
        };
        return baseMap[code] || char;
      }
      return char;
    });

    // Normalize upside-down text characters
    // Maps upside-down Unicode characters to their normal equivalents
    normalized = normalized.replace(/[\u0250-\u02AF\u2183-\u2184]/g, (char) => {
      const code = char.charCodeAt(0);
      const upsideDownMap = {
        // Upside-down lowercase
        0x0250: "q", // ɐ - upside-down a
        0x0251: "q", // ɒ - upside-down alpha
        0x0252: "q", // ɒ - upside-down turned alpha
        0x0253: "b", // ɔ - upside-down c
        0x0254: "o", // ɔ - upside-down o
        0x0255: "c", // ɕ - similar to c
        0x0256: "d", // ɖ - similar to d
        0x0257: "d", // ɗ - similar to d
        0x0259: "e", // ə - schwa (upside-down e)
        0x025a: "e", // ɚ - schwa with hook
        0x025b: "e", // ɛ - epsilon (upside-down e)
        0x025c: "e", // ɜ - reversed epsilon
        0x025d: "e", // ɝ - reversed epsilon with hook
        0x025e: "e", // ɞ - closed reversed open epsilon
        0x025f: "j", // ɟ - dotless j with stroke
        0x0260: "g", // ɠ - g with hook
        0x0261: "g", // ɡ - script g
        0x0262: "n", // ɢ - small capital g
        0x0263: "y", // ɣ - gamma
        0x0264: "y", // ɤ - rams horn
        0x0265: "h", // ɥ - turned h
        0x0266: "h", // ɦ - h with hook
        0x0267: "h", // ɧ - heng with hook
        0x0268: "i", // ɨ - i with stroke
        0x0269: "i", // ɩ - iota
        0x026a: "i", // ɪ - small capital i
        0x026b: "l", // ɫ - l with middle tilde
        0x026c: "l", // ɬ - l with belt
        0x026d: "l", // ɭ - l with retroflex hook
        0x026e: "l", // ɮ - lezh
        0x026f: "m", // ɯ - turned m
        0x0270: "m", // ɰ - turned m with long leg
        0x0271: "m", // ɱ - m with hook
        0x0272: "n", // ɲ - n with left hook
        0x0273: "n", // ɳ - n with retroflex hook
        0x0274: "n", // ɴ - small capital n
        0x0275: "o", // ɵ - barred o
        0x0276: "o", // ɶ - small capital oe
        0x0277: "o", // ɷ - closed omega
        0x0278: "f", // ɸ - phi
        0x0279: "r", // ɹ - turned r
        0x027a: "r", // ɺ - turned r with long leg
        0x027b: "r", // ɻ - turned r with hook
        0x027c: "r", // ɼ - r with long leg
        0x027d: "r", // ɽ - r with tail
        0x027e: "r", // ɾ - r with fishhook
        0x027f: "r", // ɿ - reversed r with fishhook
        0x0280: "r", // ʀ - small capital r
        0x0281: "r", // ʁ - small capital inverted r
        0x0282: "s", // ʂ - s with hook
        0x0283: "s", // ʃ - esh
        0x0284: "s", // ʄ - dotless j with stroke and hook
        0x0285: "s", // ʅ - s with hook
        0x0286: "s", // ʆ - esh with curl
        0x0287: "t", // ʇ - turned t
        0x0288: "t", // ʈ - t with retroflex hook
        0x0289: "u", // ʉ - barred u
        0x028a: "u", // ʊ - u with hook
        0x028b: "v", // ʋ - v with hook
        0x028c: "v", // ʌ - turned v (upside-down v)
        0x028d: "w", // ʍ - turned w
        0x028e: "y", // ʎ - turned y
        0x028f: "y", // ʏ - small capital y
        0x0290: "z", // ʐ - z with retroflex hook
        0x0291: "z", // ʑ - z with curl
        0x0292: "z", // ʒ - ezh
        0x0293: "z", // ʓ - ezh with curl
        0x0294: "?", // ʔ - glottal stop
        0x0295: "?", // ʕ - pharyngeal voiced fricative
        0x0296: "?", // ʖ - inverted glottal stop
        0x0297: "?", // ʗ - stretched c
        0x0298: "?", // ʘ - bilabial click
        0x0299: "b", // ʙ - small capital b
        0x029a: "e", // ʚ - closed epsilon
        0x029b: "g", // ʛ - small capital g with hook
        0x029c: "h", // ʜ - small capital h
        0x029d: "j", // ʝ - j with crossed-tail
        0x029e: "k", // ʞ - turned k
        0x029f: "l", // ʟ - small capital l
        0x02a0: "q", // ʠ - q with hook
        0x02a1: "g", // ʡ - glottal stop with stroke
        0x02a2: "g", // ʢ - reversed glottal stop with stroke
        0x02a3: "dz", // ʣ - dz digraph
        0x02a4: "dezh", // ʤ - dezh digraph
        0x02a5: "dz", // ʥ - dz digraph with curl
        0x02a6: "ts", // ʦ - ts digraph
        0x02a7: "tesh", // ʧ - tesh digraph
        0x02a8: "tc", // ʨ - tc digraph with curl
        0x02a9: "fn", // ʩ - feng digraph
        0x02aa: "ls", // ʪ - ls digraph
        0x02ab: "lz", // ʫ - lz digraph
        0x02ac: "ww", // ʬ - bilabial percussive
        0x02ad: "n", // ʭ - bidental percussive
        0x02ae: "h", // ʮ - h with hook
        0x02af: "h", // ʯ - reversed h with hook
        // Additional upside-down/turned characters
        0x2183: "c", // Ↄ - reversed c
        0x2184: "c", // ↄ - latin small letter reversed c
      };
      return upsideDownMap[code] || char;
    });

    // Normalize Modifier Letters (U+02B0-02FF, U+1D00-1D7F) - includes superscript/subscript
    // Handles characters like ᵃ (U+1D43) -> a
    normalized = normalized.replace(/[\u02B0-\u02FF\u1D00-\u1D7F]/g, (char) => {
      const code = char.charCodeAt(0);
      // Common modifier letter mappings
      const modifierMap = {
        // Modifier letters (U+02B0-02FF)
        0x02b0: "h",
        0x02b1: "h",
        0x02b2: "j",
        0x02b3: "r",
        0x02b4: "r",
        0x02b5: "r",
        0x02b6: "r",
        0x02b7: "w",
        0x02b8: "y",
        // Phonetic Extensions - superscript letters (U+1D00-1D7F)
        // These are commonly used for obfuscation
        0x1d43: "a", // ᵃ - Modifier Letter Small A
        0x1d47: "b",
        0x1d48: "d",
        0x1d49: "e",
        0x1d4d: "e",
        0x1d4f: "g",
        0x1d50: "g",
        0x1d52: "h",
        0x1d56: "i",
        0x1d57: "i",
        0x1d58: "k",
        0x1d5b: "l",
        0x1d5d: "m",
        0x1d5e: "n",
        0x1d61: "o",
        0x1d62: "o",
        0x1d63: "o",
        0x1d64: "o",
        0x1d65: "o",
        0x1d66: "p",
        0x1d67: "r",
        0x1d68: "r",
        0x1d69: "r",
        0x1d6a: "t",
        0x1d6b: "t",
        0x1d6c: "u",
        0x1d6d: "u",
        0x1d6e: "u",
        0x1d6f: "v",
        0x1d70: "w",
        0x1d71: "z",
      };
      if (modifierMap[code]) {
        return modifierMap[code];
      }
      // For other modifier letters, try to extract base character
      // Many modifier letters are just stylized versions of base letters
      const normalizedChar = char
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      // If normalization produced a single letter, use it
      if (/^[a-z]$/.test(normalizedChar)) {
        return normalizedChar;
      }
      return char;
    });

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

    normalized = normalized.replace(/[\uD835][\uDC9C-\uDD03]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      // Complete explicit mapping for Mathematical Script
      // Based on Unicode standard: these map sequentially but U+1D4C3 is 'n' visually
      const scriptLowerMap = {
        0x1d4c0: "a",
        0x1d4c1: "b",
        0x1d4c2: "c",
        0x1d4c3: "n", // Special case: U+1D4C3 is 'n'
        0x1d4c4: "o",
        0x1d4c5: "p",
        0x1d4c6: "q",
        0x1d4c7: "r",
        0x1d4c8: "s",
        0x1d4c9: "t",
        0x1d4ca: "u",
        0x1d4cb: "v",
        0x1d4cc: "w",
        0x1d4cd: "x",
        0x1d4ce: "y",
        0x1d4cf: "z",
        0x1d4d0: "a",
        0x1d4d1: "b",
        0x1d4d2: "c",
        0x1d4d3: "d",
        0x1d4d4: "e",
        0x1d4d5: "f",
        0x1d4d6: "g",
        0x1d4d7: "h",
        0x1d4d8: "i",
        0x1d4d9: "j",
        0x1d4da: "k",
        0x1d4db: "l",
        0x1d4dc: "m",
        0x1d4dd: "n",
        0x1d4de: "o",
        0x1d4df: "p",
        0x1d4e0: "q",
        0x1d4e1: "r",
        0x1d4e2: "s",
        0x1d4e3: "t",
        0x1d4e4: "u",
        0x1d4e5: "v",
        0x1d4e6: "w",
        0x1d4e7: "x",
        0x1d4e8: "y",
        0x1d4e9: "z",
      };
      if (scriptLowerMap[code]) {
        return scriptLowerMap[code];
      }
      // Uppercase fallback
      if (code >= 0x1d49c && code <= 0x1d4bf) {
        return String.fromCharCode(code - 0x1d49c + 65); // A-Z
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

    // Mathematical Bold Fraktur (U+1D56C-1D59F uppercase, U+1D5A0-1D5D3 lowercase)
    normalized = normalized.replace(/[\uD835][\uDD6C-\uDDD3]/g, (match) => {
      const high = match.charCodeAt(0);
      const low = match.charCodeAt(1);
      const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
      if (code >= 0x1d56c && code <= 0x1d59f) {
        return String.fromCharCode(code - 0x1d56c + 65); // A-Z
      } else if (code >= 0x1d5a0 && code <= 0x1d5d3) {
        return String.fromCharCode(code - 0x1d5a0 + 97); // a-z
      }
      return match;
    });

    // Small Capitals (U+1D00-1D7F) - Phonetic Extensions
    // Map small capitals to their base letters
    normalized = normalized.replace(/[\u1D00-\u1D7F]/g, (char) => {
      const code = char.charCodeAt(0);
      const smallCapMap = {
        // Small capitals A-Z
        0x1d00: "a",
        0x1d01: "ae",
        0x1d02: "b",
        0x1d03: "d",
        0x1d04: "d",
        0x1d05: "e",
        0x1d07: "e",
        0x1d08: "e",
        0x1d09: "i",
        0x1d0a: "i",
        0x1d0b: "j",
        0x1d0c: "k",
        0x1d0d: "l",
        0x1d0e: "m",
        0x1d0f: "n",
        0x1d10: "n",
        0x1d11: "o",
        0x1d12: "ou",
        0x1d13: "o",
        0x1d14: "o",
        0x1d15: "o",
        0x1d16: "o",
        0x1d17: "o",
        0x1d18: "p",
        0x1d19: "r",
        0x1d1a: "r",
        0x1d1b: "t",
        0x1d1c: "t",
        0x1d1d: "u",
        0x1d1e: "u",
        0x1d1f: "m",
        0x1d20: "v",
        0x1d21: "w",
        0x1d22: "z",
        // Additional small capitals
        0x1d26: "a",
        0x1d27: "ae",
        0x1d28: "b",
        0x1d29: "d",
        0x1d2a: "e",
        0x1d2b: "e",
        0x1d2c: "g",
        0x1d2d: "h",
        0x1d2e: "i",
        0x1d2f: "j",
        0x1d30: "k",
        0x1d31: "l",
        0x1d32: "m",
        0x1d33: "n",
        0x1d34: "o",
        0x1d35: "o",
        0x1d36: "o",
        0x1d37: "o",
        // IPA Extensions
        0x1d6b: "t",
        0x1d6c: "u",
        0x1d6d: "u",
        0x1d6e: "u",
        0x1d6f: "v",
        0x1d70: "w",
        0x1d71: "z",
      };
      return smallCapMap[code] || char;
    });

    // Remove combining marks (diacritics that combine with base characters)
    // U+0300-036F: Combining Diacritical Marks
    // U+1AB0-1AFF: Combining Diacritical Marks Extended
    // U+20D0-20FF: Combining Diacritical Marks for Symbols
    normalized = normalized.replace(
      /[\u0300-\u036F\u1AB0-\u1AFF\u20D0-\u20FF]/g,
      ""
    );

    // Remove emoji keycap sequences (numbers/symbols followed by U+20E3)
    normalized = normalized.replace(/[\u0023-\u0039]\u20E3/g, "");

    // Remove regional indicator symbols (flag emojis) U+1F1E6-1F1FF
    normalized = normalized.replace(/[\uD83C][\uDDE6-\uDDFF]/g, "");

    // Remove box drawing and block elements (U+2500-259F)
    normalized = normalized.replace(/[\u2500-\u259F]/g, "");

    // Remove geometric shapes (U+25A0-25FF)
    normalized = normalized.replace(/[\u25A0-\u25FF]/g, "");

    // Remove miscellaneous symbols (U+2600-26FF) - emojis, symbols
    // But keep common punctuation, so be selective
    normalized = normalized.replace(/[\u2600-\u26FF]/g, "");

    // Remove dingbats (U+2700-27BF)
    normalized = normalized.replace(/[\u2700-\u27BF]/g, "");

    // Remove emojis (supplementary plane - requires surrogate pairs)
    // Most emojis are in the range U+1F300-1F9FF (D83C-D83E high surrogates)
    // Pattern: Match any high surrogate (D800-DFFF) followed by low surrogate (DC00-DFFF)
    // This catches all supplementary plane characters including emojis
    normalized = normalized.replace(
      /[\uD800-\uDFFF][\uDC00-\uDFFF]/g,
      (match) => {
        const high = match.charCodeAt(0);
        const low = match.charCodeAt(1);
        const code = ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        // Check if it's in emoji ranges (U+1F300-1F9FF, U+1FA00-1FAFF, etc.)
        // Or just remove all supplementary plane characters to be safe
        if (
          (code >= 0x1f300 && code <= 0x1f9ff) || // Emoticons, Symbols, Pictographs
          (code >= 0x1fa00 && code <= 0x1faff) || // Symbols Extended-A
          (code >= 0x1fab0 && code <= 0x1faff) || // Symbols Extended-B/C
          (high >= 0xd83c && high <= 0xd83e) // Common emoji high surrogates
        ) {
          return ""; // Remove emoji
        }
        // For other supplementary plane chars, check if they're decorative
        // Keep mathematical/symbol characters that we handle separately
        if (code >= 0x1d400 && code <= 0x1d7ff) {
          return match; // Keep mathematical symbols (handled elsewhere)
        }
        // Remove other decorative/symbol characters
        return "";
      }
    );

    // Remove enclosed alphanumerics (circled, parenthesized, etc.) - U+2460-24FF
    // We already handle some, but remove others
    normalized = normalized.replace(/[\u2460-\u24FF]/g, (char) => {
      const code = char.charCodeAt(0);
      // Keep our handled ranges, remove others
      if (code >= 0x24b6 && code <= 0x24e9) {
        return char; // Already handled
      }
      if (code >= 0x249c && code <= 0x24b5) {
        return char; // Already handled
      }
      return ""; // Remove other enclosed characters
    });

    // Remove variation selectors (U+FE00-FE0F)
    normalized = normalized.replace(/[\uFE00-\uFE0F]/g, "");

    // Remove zero-width joiners/non-joiners (already handled, but ensure)
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "");

    // Remove emoji modifiers and skin tone modifiers (U+1F3FB-1F3FF)
    normalized = normalized.replace(/[\uD83C][\uDFFB-\uDFFF]/g, "");

    // Remove tag sequences (U+E0000-E007F) - rarely used but can obfuscate
    normalized = normalized.replace(/[\uDB40][\uDC00-\uDC7F]/g, "");

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
      if (
        text &&
        (text.includes("Ğ") ||
          text.includes("ᵃ") ||
          text.includes("ı") ||
          text.toLowerCase().includes("nig"))
      ) {
        logger.info(
          `[WordFilter] No blacklist to check against for: "${text}"`
        );
      }
      return { detected: false, word: null, method: null, isDefault: false };
    }

    // Normalize the input text
    const normalizedText = this.normalizeText(text);
    const originalLower = text.toLowerCase();

    // Debug: Log normalization for problematic strings (use INFO so it always shows)
    if (
      text.includes("Ğ") ||
      text.includes("ᵃ") ||
      text.includes("ı") ||
      text.toLowerCase().includes("nig")
    ) {
      logger.info(
        `[WordFilter] Input: "${text}" → Normalized: "${normalizedText}"`
      );
    }

    // Check each blacklisted word
    for (const word of combinedBlacklist) {
      if (!word || typeof word !== "string") continue;

      const normalizedWord = word.toLowerCase().trim();
      if (!normalizedWord) continue;

      // Check if this is from default blacklist
      const isDefault = this.defaultBlacklist.includes(word);

      // Method 1: Direct match in normalized text
      if (normalizedText.includes(normalizedWord)) {
        // Log detection
        if (
          text.includes("Ğ") ||
          text.includes("ᵃ") ||
          text.includes("ı") ||
          text.toLowerCase().includes("nig")
        ) {
          logger.info(
            `[WordFilter] DETECTED: "${word}" in "${text}" (normalized: "${normalizedText}") via ${"normalized_match"}`
          );
        }
        return {
          detected: true,
          word: word,
          method: "normalized_match",
          isDefault: isDefault,
        };
      }

      // Method 1.5: Fuzzy match - check if normalized text is similar to word (for cases where non-Latin chars were removed)
      // This handles cases like "ngga" vs "nigga" where a character was removed
      if (
        normalizedWord.length >= 4 &&
        normalizedText.length >= normalizedWord.length - 1
      ) {
        // Check if removing one character from normalizedText makes it match
        for (let i = 0; i < normalizedText.length; i++) {
          const withCharRemoved =
            normalizedText.slice(0, i) + normalizedText.slice(i + 1);
          if (withCharRemoved.includes(normalizedWord)) {
            return {
              detected: true,
              word: word,
              method: "fuzzy_match",
              isDefault: isDefault,
            };
          }
        }
        // Also check if adding one character would match (for cases where a char was inserted)
        for (let i = 0; i <= normalizedWord.length; i++) {
          for (let charCode = 97; charCode <= 122; charCode++) {
            const char = String.fromCharCode(charCode);
            const withCharAdded =
              normalizedWord.slice(0, i) + char + normalizedWord.slice(i);
            if (normalizedText.includes(withCharAdded)) {
              return {
                detected: true,
                word: word,
                method: "fuzzy_match",
                isDefault: isDefault,
              };
            }
          }
        }
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
      // Check both original text and normalized text for leetspeak patterns
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
          // Check both original and normalized text
          if (leetRegex.test(text) || leetRegex.test(normalizedText)) {
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

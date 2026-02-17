// Minimal frontmatter-like metadata parser for artifacts
// Supports YAML-like key:value pairs within --- delimiters

export type ParsedMetadata = Record<string, unknown>;

/**
 * Parse frontmatter from artifact content
 * Expects format:
 * ---
 * key: value
 * nested:
 *   key: value
 * ---
 * (rest of content)
 */
export function parseFrontmatter(content: string): ParsedMetadata | null {
  const lines = content.split("\n");
  
  // Check for frontmatter delimiter
  if (!lines[0]?.trim().startsWith("---")) {
    return null;
  }

  // Find closing delimiter
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim().startsWith("---")) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return null;
  }

  // Extract frontmatter lines
  const frontmatterLines = lines.slice(1, endIdx);
  
  // Parse simple key:value pairs (minimal YAML subset)
  const metadata: ParsedMetadata = {};
  let currentSection: Record<string, unknown> | null = null;
  let currentKey: string | null = null;

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.search(/\S/);
    
    if (indent === 0) {
      // Top-level key
      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (value.trim()) {
          metadata[key] = parseValue(value.trim());
          currentSection = null;
          currentKey = null;
        } else {
          // Section header
          currentKey = key;
          currentSection = {};
          metadata[key] = currentSection;
        }
      }
    } else if (currentSection && indent > 0) {
      // Nested key
      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        currentSection[key] = parseValue(value.trim());
      }
    }
  }

  return metadata;
}

function parseValue(value: string): unknown {
  // Handle basic types
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  
  // Handle numbers
  const num = Number(value);
  if (!isNaN(num) && value.match(/^-?\d+(\.\d+)?$/)) {
    return num;
  }
  
  // Handle arrays
  if (value.startsWith("[") && value.endsWith("]")) {
    const items = value.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
    return items.map(parseValue);
  }
  
  // Handle quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  
  // Default to string
  return value;
}

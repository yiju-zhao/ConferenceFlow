/**
 * Parse a single CSV line, handling quoted fields with escaped quotes.
 */
export function parseCSVLine(text) {
  let ret = [],
    inQuote = false,
    value = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        value += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        ret.push(value.trim());
        value = "";
      } else {
        value += ch;
      }
    }
  }
  ret.push(value.trim());
  return ret;
}

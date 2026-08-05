export type DiffOp = "equal" | "insert" | "delete";
export interface DiffEntry {
  text: string;
  type: DiffOp;
}

/** LCS-based diff of two string arrays. */
export function diffArrays(oldArr: string[], newArr: string[]): DiffEntry[] {
  const m = oldArr.length,
    n = newArr.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        oldArr[i - 1] === newArr[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result: DiffEntry[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
      result.unshift({ text: oldArr[i - 1], type: "equal" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: newArr[j - 1], type: "insert" });
      j--;
    } else {
      result.unshift({ text: oldArr[i - 1], type: "delete" });
      i--;
    }
  }
  return result;
}

/** Strip HTML tags and normalize whitespace. */
export function stripHtml(html: string): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract text lines from HTML content. */
export function getTextLines(html: string): string[] {
  return stripHtml(html)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

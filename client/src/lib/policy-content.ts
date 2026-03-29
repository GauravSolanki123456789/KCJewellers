import fs from "fs";
import path from "path";

export type PolicySlug = "terms" | "privacy" | "refunds" | "shipping";

const POLICY_DIR = path.join(process.cwd(), "content", "policies");

/**
 * Plain-text policy body from `content/policies/{slug}.txt` (edit files on disk; no redeploy for copy if you sync files).
 */
export function getPolicyPlainText(slug: PolicySlug): string {
  const filePath = path.join(POLICY_DIR, `${slug}.txt`);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "This policy is being updated. Please check back soon.\n\nIf you need help, contact KC Jewellers support.";
  }
}

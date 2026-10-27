export type Role = "QA_TESTER" | "REVIEWER" | "ADMIN";

export const ROLE_LABELS: Record<Role, string> = {
  QA_TESTER: "QA Tester",
  REVIEWER: "Product/Finance Reviewer",
  ADMIN: "Administrator",
};

export function canReviewConfig(role: Role | undefined): boolean {
  return role === "REVIEWER" || role === "ADMIN";
}

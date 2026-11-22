// Piccolo wrapper sulla CLI `gh` (disponibile sui runner di GitHub Actions, autenticata con GH_TOKEN).
import { execFileSync } from "node:child_process";

const REPO = process.env.GITHUB_REPOSITORY;
export const gh = (...args) => execFileSync("gh", [...args, "-R", REPO], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export const ghJSON = (...args) => JSON.parse(gh(...args) || "null");

export function findOpenIssue(titlePrefix) {
  const list = ghJSON("issue", "list", "--state", "open", "--limit", "50", "--json", "number,title,updatedAt", "--search", `"${titlePrefix}" in:title`);
  return list?.find((i) => i.title.startsWith(titlePrefix)) ?? null;
}

export function lastCommentAt(number) {
  const j = ghJSON("issue", "view", String(number), "--json", "comments,createdAt");
  const last = j?.comments?.at(-1)?.createdAt ?? j?.createdAt;
  return last ? Date.parse(last) : 0;
}

export const createIssue = (title, body) => gh("issue", "create", "--title", title, "--body", body);
export const comment = (number, body) => gh("issue", "comment", String(number), "--body", body);
export const close = (number, body) => { if (body) comment(number, body); gh("issue", "close", String(number), "--reason", "completed"); };

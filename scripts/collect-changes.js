require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputPath = path.resolve(process.cwd(), "release-input.json");
const targetRepo = process.env.TARGET_REPO
  ? path.resolve(process.env.TARGET_REPO)
  : process.cwd();

function run(command, fallback = "") {
  try {
    return execSync(command, {
      cwd: targetRepo,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    return fallback || `[No se pudo ejecutar: ${command}]`;
  }
}

function getDate() {
  return new Date().toISOString().slice(0, 10);
}

const date = getDate();

const repo =
  process.env.BITBUCKET_REPO_FULL_NAME ||
  run("basename $(git rev-parse --show-toplevel)", "unknown-repo");

const branch =
  process.env.BITBUCKET_BRANCH ||
  run("git branch --show-current", "unknown-branch");

const commit =
  process.env.BITBUCKET_COMMIT ||
  run("git rev-parse HEAD", "unknown-commit");

const commits = run(
  'git log -10 --pretty=format:"%h - %s (%an)"',
  "No hay commits disponibles."
);

const diffStat = run(
  "git diff HEAD~1 HEAD --stat",
  "No hay diff estadístico disponible."
);

const diffSummary = run(
  "git diff HEAD~1 HEAD -- src scripts package.json README.md",
  "No hay diff resumido disponible."
);

const payload = {
  date,
  repo,
  branch,
  commit,
  targetRepo,
  releaseStatus: process.env.RELEASE_STATUS || "unknown",
  commits,
  diffStat,
  diffSummary,
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

console.log(`release-input.json generado en ${outputPath}`);

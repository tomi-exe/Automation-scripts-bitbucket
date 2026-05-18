require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const inputPath = path.resolve(process.cwd(), "release-input.json");
const htmlPath = path.resolve(process.cwd(), "release-doc.html");

const requiredEnvVars = ["RELEASE_SITE_URL", "RELEASE_SITE_TOKEN"];
const brokenStatuses = ["broken", "failed", "failure"];

function getEnv(name, { required = false } = {}) {
  const value = process.env[name]?.trim();

  if (required && !value) {
    throw new Error(`Falta ${name} en variables de entorno.`);
  }

  if (value?.startsWith("$")) {
    throw new Error(
      `La variable ${name} parece estar mal configurada: contiene el literal ${value}. Usa el valor real, sin $ ni comillas.`
    );
  }

  return value;
}

function validateEnv() {
  requiredEnvVars.forEach((name) => getEnv(name, { required: true }));
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró ${label}: ${filePath}`);
  }
}

function getCommitShort(commit) {
  if (!commit || commit === "unknown-commit") {
    return "unknown";
  }

  return commit.slice(0, 7);
}

function getReleaseStatus(input) {
  return (input.releaseStatus || "unknown").toLowerCase();
}

function getReleaseTitle(input) {
  const status = getReleaseStatus(input);
  const prefix = brokenStatuses.includes(status) ? "[BROKEN] " : "";
  return `${prefix}Release ${input.date} - ${input.branch} - ${getCommitShort(
    input.commit
  )}`;
}

function getProjectSlug(input) {
  return input.repoSlug || input.repoFullName?.split("/").pop() || input.repo;
}

function getTestsPayload(input) {
  const status = getReleaseStatus(input);
  const failed = brokenStatuses.includes(status);

  return {
    status: failed ? "failed" : status === "passed" ? "passed" : "unknown",
    failed,
    output: input.testOutput || "No hay salida de tests disponible.",
  };
}

function buildPayload(input, html) {
  const projectSlug = getProjectSlug(input);
  const releaseStatus = getReleaseStatus(input);

  return {
    source: "bitbucket-pipelines",
    generatedBy: "Automation-scripts-bitbucket",
    generatedAt: new Date().toISOString(),
    date: input.date,
    project: {
      key: input.projectKey || "",
      slug: projectSlug,
      name: projectSlug,
    },
    repository: {
      fullName: input.repoFullName || input.repo,
      slug: input.repoSlug || projectSlug,
      url: input.repoUrl || "",
      targetPath: input.targetRepo || "",
    },
    release: {
      title: getReleaseTitle(input),
      status: releaseStatus,
      branch: input.branch,
      commit: input.commit,
      commitShort: getCommitShort(input.commit),
    },
    content: {
      html,
    },
    changes: {
      commits: input.commits,
      diffStat: input.diffStat,
      diffSummary: input.diffSummary,
    },
    tests: getTestsPayload(input),
    routing: {
      wikiPath: `/proyectos/${projectSlug}/wiki`,
      projectSlugSource: input.repoSlug ? "repository.slug" : "repository.name",
    },
  };
}

async function main() {
  validateEnv();
  assertFileExists(inputPath, "release-input.json");
  assertFileExists(htmlPath, "release-doc.html");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const html = fs.readFileSync(htmlPath, "utf-8");
  const payload = buildPayload(input, html);
  const url = getEnv("RELEASE_SITE_URL", { required: true });
  const token = getEnv("RELEASE_SITE_TOKEN", { required: true });

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  console.log("Release publicado en web interna.");
  console.log(`Proyecto: ${payload.project.slug}`);
  console.log(`Wiki path: ${payload.routing.wikiPath}`);

  if (response.data?.url) {
    console.log(`URL: ${response.data.url}`);
  }
}

main().catch((error) => {
  console.error("Error publicando release en web interna:");

  if (error.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(error.message);
  }

  process.exit(1);
});

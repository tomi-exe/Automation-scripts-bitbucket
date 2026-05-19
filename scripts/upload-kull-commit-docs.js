require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const inputPath = path.resolve(process.cwd(), "release-input.json");
const markdownPath = path.resolve(process.cwd(), "release-doc.md");
const defaultKullUrl = "https://api-manage.kull.cl/api/commit-docs/webhook";
const retryDelaysMs = [5000, 15000, 60000];
const brokenStatuses = ["broken", "failed", "failure", "error"];

function getEnv(name, { required = false, fallback = "" } = {}) {
  const value = process.env[name]?.trim() || fallback;

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

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró ${label}: ${filePath}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getProjectSlug(input) {
  return input.repoSlug || input.repoFullName?.split("/").pop() || input.repo;
}

function getRepositoryUrl(input) {
  if (input.repoUrl) {
    return input.repoUrl.replace(/\.git$/, "");
  }

  if (input.repoFullName?.includes("/")) {
    return `https://bitbucket.org/${input.repoFullName}`;
  }

  if (input.repo?.startsWith("http")) {
    return input.repo.replace(/\.git$/, "");
  }

  if (input.repo?.includes("/")) {
    return `https://bitbucket.org/${input.repo}`;
  }

  if (process.env.BITBUCKET_REPO_FULL_NAME) {
    return `https://bitbucket.org/${process.env.BITBUCKET_REPO_FULL_NAME}`;
  }

  return "";
}

function getReleaseTitle(input) {
  const status = getReleaseStatus(input);
  const prefix = brokenStatuses.includes(status) ? "[BROKEN] " : "";

  return `${prefix}Release ${input.date} - ${input.branch} - ${getCommitShort(
    input.commit
  )}`;
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

function buildPayload(input, markdown) {
  const projectSlug = getProjectSlug(input);
  const repositoryUrl = getRepositoryUrl(input);

  if (!repositoryUrl) {
    throw new Error(
      "No se pudo construir repository.url. Ejecuta desde Bitbucket o incluye repoUrl/repoFullName en release-input.json."
    );
  }

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
      url: repositoryUrl,
      fullName: input.repoFullName || input.repo || projectSlug,
      slug: input.repoSlug || projectSlug,
      targetPath: input.targetRepo || "",
    },
    release: {
      title: getReleaseTitle(input),
      status: getReleaseStatus(input),
      branch: input.branch,
      commit: input.commit,
      commitShort: getCommitShort(input.commit),
    },
    content: {
      markdown,
    },
    changes: {
      commits: input.commits,
      diffStat: input.diffStat,
      diffSummary: input.diffSummary,
    },
    tests: getTestsPayload(input),
    routing: {
      wikiPath: `/proyectos/${projectSlug}/wiki`,
      projectSlugSource: "repository.slug",
    },
  };
}

function isRetriableError(error) {
  if (error.response?.status) {
    return error.response.status >= 500;
  }

  return true;
}

function formatResponseData(data) {
  if (!data) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  return JSON.stringify(data, null, 2);
}

async function postWithRetries(url, token, payload) {
  let lastError;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await axios.post(url, payload, {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      lastError = error;

      if (!isRetriableError(error) || attempt === retryDelaysMs.length) {
        throw error;
      }

      const delay = retryDelaysMs[attempt];
      console.warn(
        `Kull no respondió correctamente. Reintentando en ${delay / 1000}s...`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

async function main() {
  assertFileExists(inputPath, "release-input.json");
  assertFileExists(markdownPath, "release-doc.md");

  const url = getEnv("KULL_COMMIT_DOCS_URL", {
    fallback: defaultKullUrl,
  }).replace(/\/$/, "");
  const token = getEnv("KULL_COMMIT_DOCS_TOKEN", { required: true });
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const markdown = fs.readFileSync(markdownPath, "utf-8");
  const payload = buildPayload(input, markdown);

  const response = await postWithRetries(url, token, payload);
  const resultStatus = response.data?.status || response.status;

  console.log("Release publicado en Kull.");
  console.log(`Estado Kull: ${resultStatus}`);
  console.log(`Proyecto: ${payload.project.slug}`);
  console.log(`Repositorio: ${payload.repository.url}`);
  console.log(`Wiki path: ${payload.routing.wikiPath}`);

  if (response.data?.url) {
    console.log(`URL: ${response.data.url}`);
  }

  if (response.data?.reason) {
    console.log(`Detalle: ${response.data.reason}`);
  }
}

main().catch((error) => {
  console.error("Error publicando release en Kull:");

  if (error.response?.status === 400) {
    console.error("Kull respondió 400 Bad Request. Revisa el payload enviado.");
  }

  if (error.response?.status === 401) {
    console.error(
      "Kull respondió 401 Unauthorized. Revisa KULL_COMMIT_DOCS_TOKEN en Bitbucket."
    );
  }

  if (error.response?.data) {
    console.error(formatResponseData(error.response.data));
  } else {
    console.error(error.message);
  }

  process.exit(1);
});

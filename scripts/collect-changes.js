require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const outputPath = path.resolve(process.cwd(), "release-input.json");
const targetRepo = process.env.TARGET_REPO
  ? path.resolve(process.env.TARGET_REPO)
  : process.cwd();

const maxDiffSummaryChars = 25000;
const maxFileDiffChars = 6000;
const maxFileSnippetChars = 4000;
const maxDocsChars = 6000;
const maxProjectFiles = 300;
const maxFileSummaries = 20;

const ignoredPathPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)coverage\//,
  /(^|\/)\.next\//,
  /(^|\/)\.turbo\//,
  /(^|\/)\.cache\//,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
];

const readableExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".html",
  ".css",
  ".scss",
  ".env",
]);

function run(command, fallback = "") {
  try {
    return execSync(command, {
      cwd: targetRepo,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 10,
    }).trim();
  } catch (error) {
    return fallback || `[No se pudo ejecutar: ${command}]`;
  }
}

function runLines(command) {
  const output = run(command, "");

  if (!output || output.startsWith("[No se pudo ejecutar:")) {
    return [];
  }

  return output.split(/\r?\n/).filter(Boolean);
}

function truncate(value, maxChars) {
  if (!value) {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n[Contenido truncado a ${maxChars} caracteres]`;
}

function shellQuote(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function normalizeGitPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function shouldIgnoreFile(filePath) {
  const normalizedPath = normalizeGitPath(filePath);

  return ignoredPathPatterns.some((pattern) => pattern.test(normalizedPath));
}

function isReadableFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  return readableExtensions.has(extension);
}

function isInsideTargetRepo(absolutePath) {
  const relativePath = path.relative(targetRepo, absolutePath);

  return (
    Boolean(relativePath) &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function readRepoFile(filePath, maxChars = maxFileSnippetChars) {
  const normalizedPath = normalizeGitPath(filePath);

  if (shouldIgnoreFile(normalizedPath) || !isReadableFile(normalizedPath)) {
    return "";
  }

  const absolutePath = path.resolve(targetRepo, normalizedPath);

  if (!isInsideTargetRepo(absolutePath) || !fs.existsSync(absolutePath)) {
    return "";
  }

  const stats = fs.statSync(absolutePath);

  if (!stats.isFile() || stats.size > 1024 * 1024) {
    return "";
  }

  return truncate(fs.readFileSync(absolutePath, "utf-8"), maxChars);
}

function getDate() {
  return new Date().toISOString().slice(0, 10);
}

function getRepoName() {
  if (process.env.BITBUCKET_REPO_FULL_NAME) {
    return process.env.BITBUCKET_REPO_FULL_NAME;
  }

  const root = run("git rev-parse --show-toplevel", "");

  return root ? path.basename(root) : "unknown-repo";
}

function getRepoSlug(repoName) {
  if (process.env.BITBUCKET_REPO_SLUG) {
    return process.env.BITBUCKET_REPO_SLUG;
  }

  if (repoName.includes("/")) {
    return repoName.split("/").pop();
  }

  return path.basename(repoName).replace(/\.git$/, "") || "unknown-repo";
}

function getRepoUrl(repoName) {
  if (process.env.BITBUCKET_GIT_HTTP_ORIGIN) {
    return process.env.BITBUCKET_GIT_HTTP_ORIGIN;
  }

  if (process.env.BITBUCKET_REPO_FULL_NAME) {
    return `https://bitbucket.org/${process.env.BITBUCKET_REPO_FULL_NAME}`;
  }

  if (repoName.startsWith("http")) {
    return repoName;
  }

  return run("git config --get remote.origin.url", "");
}

function parseChangedFiles() {
  return runLines("git diff --name-status HEAD~1 HEAD").map((line) => {
    const parts = line.split(/\t+/);
    const status = parts[0];
    const filePath = parts[parts.length - 1];

    return {
      status,
      path: normalizeGitPath(filePath),
    };
  });
}

function getProjectStructure() {
  return runLines("git ls-files")
    .map(normalizeGitPath)
    .filter((filePath) => !shouldIgnoreFile(filePath))
    .slice(0, maxProjectFiles);
}

function getFileSummaries(changedFiles) {
  return changedFiles
    .filter((file) => !shouldIgnoreFile(file.path))
    .slice(0, maxFileSummaries)
    .map((file) => {
      const quotedPath = shellQuote(file.path);
      const diff = run(`git diff HEAD~1 HEAD -- ${quotedPath}`, "");

      return {
        path: file.path,
        status: file.status,
        diff: truncate(diff, maxFileDiffChars),
        currentSnippet: readRepoFile(file.path),
      };
    });
}

function readJsonFile(fileName) {
  try {
    const absolutePath = path.resolve(targetRepo, fileName);

    if (!isInsideTargetRepo(absolutePath) || !fs.existsSync(absolutePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  } catch (error) {
    return null;
  }
}

function getPackageInfo() {
  const packageJson = readJsonFile("package.json");

  if (!packageJson) {
    return {
      detected: false,
      message: "No se encontró package.json o no se pudo parsear.",
    };
  }

  return {
    detected: true,
    name: packageJson.name || "",
    version: packageJson.version || "",
    description: packageJson.description || "",
    scripts: packageJson.scripts || {},
    dependencies: Object.keys(packageJson.dependencies || {}),
    devDependencies: Object.keys(packageJson.devDependencies || {}),
  };
}

function getDocsContext() {
  const docsCandidates = [
    "README.md",
    "readme.md",
    "docs/README.md",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "api-docs.yaml",
    "api-docs.yml",
  ];

  const seenContent = new Set();

  return docsCandidates
    .map((filePath) => ({
      path: filePath,
      content: readRepoFile(filePath, maxDocsChars),
    }))
    .filter((doc) => {
      if (!doc.content || seenContent.has(doc.content)) {
        return false;
      }

      seenContent.add(doc.content);
      return true;
    });
}

function detectApiSurface(projectStructure) {
  const candidateFiles = projectStructure.filter((filePath) => {
    const normalizedPath = filePath.toLowerCase();

    return (
      isReadableFile(filePath) &&
      (normalizedPath.includes("route") ||
        normalizedPath.includes("controller") ||
        normalizedPath.includes("app.") ||
        normalizedPath.includes("server.") ||
        normalizedPath.includes("api") ||
        normalizedPath.includes("validator") ||
        normalizedPath.includes("service"))
    );
  });

  const routePattern =
    /\b(app|router)\s*\.\s*(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  const findings = [];

  candidateFiles.slice(0, 50).forEach((filePath) => {
    const content = readRepoFile(filePath, 12000);
    const matches = [...content.matchAll(routePattern)];

    matches.forEach((match) => {
      findings.push({
        file: filePath,
        method: match[2].toUpperCase(),
        path: match[3],
      });
    });
  });

  return findings;
}

function readTestOutput() {
  const testOutputPath = process.env.TEST_OUTPUT_PATH;

  if (!testOutputPath) {
    return "No hay salida de tests disponible.";
  }

  try {
    const resolvedPath = path.resolve(testOutputPath);
    const output = fs.readFileSync(resolvedPath, "utf-8").trim();

    if (!output) {
      return "El archivo de salida de tests existe, pero está vacío.";
    }

    return output.slice(-12000);
  } catch (error) {
    return `[No se pudo leer TEST_OUTPUT_PATH: ${testOutputPath}]`;
  }
}

function getTestSummary(testOutput) {
  const lines = testOutput.split(/\r?\n/).filter(Boolean);
  const relevantPatterns =
    /(FAIL|PASS|Test Suites:|Tests:|expect\(|Expected|Received|Error:|Assertion|at .*\.test\.|\.test\.)/i;

  return {
    status: process.env.RELEASE_STATUS || "unknown",
    failed: ["broken", "failed", "failure"].includes(
      (process.env.RELEASE_STATUS || "").toLowerCase()
    ),
    highlights: lines.filter((line) => relevantPatterns.test(line)).slice(0, 80),
  };
}

const date = getDate();
const repo = getRepoName();
const branch =
  process.env.BITBUCKET_BRANCH ||
  run("git branch --show-current", "unknown-branch");
const commit =
  process.env.BITBUCKET_COMMIT ||
  run("git rev-parse HEAD", "unknown-commit");
const changedFiles = parseChangedFiles();
const projectStructure = getProjectStructure();
const testOutput = readTestOutput();

const commits = run(
  'git log -10 --pretty=format:"%h - %s (%an)"',
  "No hay commits disponibles."
);

const diffStat = run(
  "git diff HEAD~1 HEAD --stat",
  "No hay diff estadístico disponible."
);

const diffSummary = truncate(
  run("git diff HEAD~1 HEAD -- .", "No hay diff resumido disponible."),
  maxDiffSummaryChars
);

const payload = {
  date,
  repo,
  repoFullName: process.env.BITBUCKET_REPO_FULL_NAME || repo,
  repoSlug: getRepoSlug(repo),
  repoUrl: getRepoUrl(repo),
  projectKey: process.env.BITBUCKET_PROJECT_KEY || "",
  branch,
  commit,
  targetRepo,
  releaseStatus: process.env.RELEASE_STATUS || "unknown",
  testOutput,
  commits,
  diffStat,
  diffSummary,
  changedFiles,
  fileSummaries: getFileSummaries(changedFiles),
  projectStructure,
  packageInfo: getPackageInfo(),
  detectedApiSurface: detectApiSurface(projectStructure),
  docsContext: getDocsContext(),
  testSummary: getTestSummary(testOutput),
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

console.log(`release-input.json generado en ${outputPath}`);

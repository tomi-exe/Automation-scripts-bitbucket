require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { marked } = require("marked");

const inputPath = path.resolve(process.cwd(), "release-input.json");
const markdownPath = path.resolve(process.cwd(), "release-doc.md");

const requiredEnvVars = [
  "CONFLUENCE_EMAIL",
  "CONFLUENCE_API_TOKEN",
  "CONFLUENCE_BASE_URL",
  "CONFLUENCE_SPACE_ID",
  "CONFLUENCE_PARENT_PAGE_ID",
];

function validateEnv() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas: ${missing.join(", ")}`);
  }

  const invalid = requiredEnvVars.filter((key) =>
    process.env[key]?.trim().startsWith("$")
  );

  if (invalid.length > 0) {
    throw new Error(
      `Variables mal configuradas: ${invalid.join(
        ", "
      )}. Usa valores reales en Bitbucket, sin $ ni comillas.`
    );
  }
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró ${label}: ${filePath}`);
  }
}

function getAuthHeader() {
  return Buffer.from(
    `${process.env.CONFLUENCE_EMAIL}:${process.env.CONFLUENCE_API_TOKEN}`
  ).toString("base64");
}

function getHeaders(auth) {
  return {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function resolveSpaceId(baseUrl, auth) {
  const configuredSpace = process.env.CONFLUENCE_SPACE_ID;

  if (/^\d+$/.test(configuredSpace)) {
    return configuredSpace;
  }

  const response = await axios.get(`${baseUrl}/api/v2/spaces`, {
    params: {
      keys: configuredSpace,
      limit: 1,
    },
    headers: getHeaders(auth),
  });

  const space = response.data?.results?.[0];

  if (!space?.id) {
    throw new Error(
      `No se encontró un espacio de Confluence con key: ${configuredSpace}`
    );
  }

  console.log(`Space key ${configuredSpace} resuelta como ID ${space.id}.`);
  return space.id;
}

function getTitle(input, suffix = "") {
  const status = (input.releaseStatus || "").toLowerCase();
  const statusPrefix = ["broken", "failed", "failure"].includes(status)
    ? "[BROKEN] "
    : "";
  const baseTitle = `${statusPrefix}Release ${input.date} - ${input.branch}`;
  return suffix ? `${baseTitle} - ${suffix}` : baseTitle;
}

function getCommitSuffix(input) {
  if (!input.commit || input.commit === "unknown-commit") {
    return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
  }

  return input.commit.slice(0, 7);
}

function isDuplicateTitleError(error) {
  const errors = error.response?.data?.errors || [];

  return errors.some((item) => {
    const text = `${item.title || ""} ${item.detail || ""}`.toLowerCase();
    return text.includes("same title") || text.includes("title already exists");
  });
}

async function createPage(baseUrl, auth, payload) {
  return axios.post(`${baseUrl}/api/v2/pages`, payload, {
    headers: getHeaders(auth),
  });
}

async function main() {
  validateEnv();

  assertFileExists(inputPath, "release-input.json");
  assertFileExists(markdownPath, "release-doc.md");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const markdown = fs.readFileSync(markdownPath, "utf-8");
  const html = marked.parse(markdown);

  const baseUrl = process.env.CONFLUENCE_BASE_URL.replace(/\/$/, "");
  const auth = getAuthHeader();
  const spaceId = await resolveSpaceId(baseUrl, auth);

  const payload = {
    spaceId,
    status: "current",
    title: getTitle(input),
    parentId: process.env.CONFLUENCE_PARENT_PAGE_ID,
    body: {
      representation: "storage",
      value: html,
    },
  };

  let response;

  try {
    response = await createPage(baseUrl, auth, payload);
  } catch (error) {
    if (!isDuplicateTitleError(error)) {
      throw error;
    }

    payload.title = getTitle(input, getCommitSuffix(input));
    console.log(`El título ya existía. Reintentando como: ${payload.title}`);
    response = await createPage(baseUrl, auth, payload);
  }

  console.log("Página creada en Confluence.");
  console.log(`ID: ${response.data.id}`);
  console.log(`Título: ${payload.title}`);
}

main().catch((error) => {
  console.error("Error publicando en Confluence:");

  if (error.response?.status === 401) {
    console.error(
      "Confluence respondió 401 Unauthorized. Revisa CONFLUENCE_EMAIL y CONFLUENCE_API_TOKEN en Bitbucket; deben ser valores reales y no literales como $CONFLUENCE_API_TOKEN."
    );
  }

  if (error.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(error.message);
  }

  process.exit(1);
});

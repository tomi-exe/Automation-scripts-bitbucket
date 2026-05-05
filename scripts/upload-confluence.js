require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const inputPath = path.resolve(process.cwd(), "release-input.json");
const htmlPath = path.resolve(process.cwd(), "release-doc.html");

const requiredEnvVars = [
  "CONFLUENCE_EMAIL",
  "CONFLUENCE_API_TOKEN",
  "CONFLUENCE_BASE_URL",
  "CONFLUENCE_SPACE_ID",
  "CONFLUENCE_PARENT_PAGE_ID",
];

function validateEnv() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas: ${missing.join(", ")}`);
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

async function main() {
  validateEnv();

  assertFileExists(inputPath, "release-input.json");
  assertFileExists(htmlPath, "release-doc.html");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const html = fs.readFileSync(htmlPath, "utf-8");

  const baseUrl = process.env.CONFLUENCE_BASE_URL.replace(/\/$/, "");
  const title = `Release ${input.date} - ${input.branch}`;
  const auth = getAuthHeader();
  const spaceId = await resolveSpaceId(baseUrl, auth);

  const payload = {
    spaceId,
    status: "current",
    title,
    parentId: process.env.CONFLUENCE_PARENT_PAGE_ID,
    body: {
      representation: "storage",
      value: html,
    },
  };

  const response = await axios.post(`${baseUrl}/api/v2/pages`, payload, {
    headers: getHeaders(auth),
  });

  console.log("Página creada en Confluence.");
  console.log(`ID: ${response.data.id}`);
  console.log(`Título: ${title}`);
}

main().catch((error) => {
  console.error("Error publicando en Confluence:");

  if (error.response?.data) {
    console.error(JSON.stringify(error.response.data, null, 2));
  } else {
    console.error(error.message);
  }

  process.exit(1);
});

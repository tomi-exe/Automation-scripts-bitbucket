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

async function main() {
  validateEnv();

  assertFileExists(inputPath, "release-input.json");
  assertFileExists(htmlPath, "release-doc.html");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const html = fs.readFileSync(htmlPath, "utf-8");

  const baseUrl = process.env.CONFLUENCE_BASE_URL.replace(/\/$/, "");
  const title = `Release ${input.date} - ${input.branch}`;

  const auth = Buffer.from(
    `${process.env.CONFLUENCE_EMAIL}:${process.env.CONFLUENCE_API_TOKEN}`
  ).toString("base64");

  const payload = {
    spaceId: process.env.CONFLUENCE_SPACE_ID,
    status: "current",
    title,
    parentId: process.env.CONFLUENCE_PARENT_PAGE_ID,
    body: {
      representation: "storage",
      value: html,
    },
  };

  const response = await axios.post(`${baseUrl}/api/v2/pages`, payload, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
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

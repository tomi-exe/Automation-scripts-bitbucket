require("dotenv").config();

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const inputPath = path.resolve(process.cwd(), "release-input.json");
const templatePath = path.resolve(
  process.cwd(),
  "templates",
  "confluence-release-template.html"
);
const outputPath = path.resolve(process.cwd(), "release-doc.html");
const brokenStatuses = ["broken", "failed", "failure"];

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró ${label}: ${filePath}`);
  }
}

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

function getAiConfig() {
  const groqApiKey = getEnv("GROQ_API_KEY", { required: true });
  const model = getEnv("AI_MODEL") || "llama-3.1-8b-instant";

  return {
    provider: "groq",
    model,
    clientOptions: {
      apiKey: groqApiKey,
      baseURL: "https://api.groq.com/openai/v1",
    },
  };
}

function getReleaseStatus(input) {
  return (input.releaseStatus || "unknown").toLowerCase();
}

function decorateReleaseStatus(html, input) {
  const status = getReleaseStatus(input);

  if (!brokenStatuses.includes(status)) {
    return html;
  }

  return html.replace(
    /<h1([^>]*)>/i,
    '<h1$1 style="color: #bf2600;">'
  );
}

async function main() {
  assertFileExists(inputPath, "release-input.json");
  assertFileExists(templatePath, "confluence-release-template.html");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const template = fs.readFileSync(templatePath, "utf-8");
  const aiConfig = getAiConfig();

  const client = new OpenAI(aiConfig.clientOptions);

  const prompt = `
Genera documentación de release en HTML simple para una página web interna.

Debes usar exactamente este template:

${template}

Datos reales disponibles:

Fecha:
${input.date}

Repositorio:
${input.repo}

Branch:
${input.branch}

Commit:
${input.commit}

Commits:
${input.commits}

Diff estadístico:
${input.diffStat}

Diff resumido:
${input.diffSummary}

Estado del release:
${input.releaseStatus || "unknown"}

Salida de tests:
${input.testOutput || "No hay salida de tests disponible."}

Reglas obligatorias:
- Devuelve solo HTML final.
- No uses Markdown.
- No inventes información.
- Si la información no permite afirmar algo, escribe que no se identifica con la información disponible.
- Si el estado del release es broken, explica qué prueba falló usando la salida de tests disponible.
- Si hay stack trace o assertion error de tests, resume el archivo, nombre del test, diferencia esperada/recibida y causa probable.
- Separa claramente resumen funcional y resumen técnico.
- El resumen funcional debe ser entendible por negocio, PM o QA.
- El resumen técnico debe servir a desarrolladores.
- Mantén la estructura del template.
- Reemplaza todos los placeholders.
- En listas HTML usa elementos <li>.
- No incluyas explicaciones fuera del HTML.
`;

  const response = await client.chat.completions.create({
    model: aiConfig.model,
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente técnico que genera documentación de releases precisa, estructurada y compatible con Confluence.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
  });

  const html = response.choices[0]?.message?.content;

  if (!html) {
    throw new Error("OpenAI no devolvió contenido.");
  }

  const decoratedHtml = decorateReleaseStatus(html, input);

  fs.writeFileSync(outputPath, decoratedHtml);

  console.log(`release-doc.html generado en ${outputPath}`);
  console.log(`Proveedor AI usado: ${aiConfig.provider}`);
  console.log(`Modelo AI usado: ${aiConfig.model}`);
  console.log(`Estado del release: ${getReleaseStatus(input)}`);
}

main().catch((error) => {
  console.error("Error generando documentación:", error.message);
  process.exit(1);
});

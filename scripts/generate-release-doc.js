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

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró ${label}: ${filePath}`);
  }
}

function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("Falta GROQ_API_KEY en variables de entorno.");
    }

    return {
      provider,
      model: process.env.AI_MODEL || "llama-3.1-8b-instant",
      clientOptions: {
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      },
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Falta OPENAI_API_KEY en variables de entorno.");
  }

  return {
    provider,
    model: process.env.AI_MODEL || "gpt-4.1-mini",
    clientOptions: {
      apiKey: process.env.OPENAI_API_KEY,
    },
  };
}

async function main() {
  assertFileExists(inputPath, "release-input.json");
  assertFileExists(templatePath, "confluence-release-template.html");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const template = fs.readFileSync(templatePath, "utf-8");
  const aiConfig = getAiConfig();

  const client = new OpenAI(aiConfig.clientOptions);

  const prompt = `
Genera documentación de release en HTML compatible con Confluence.

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

Reglas obligatorias:
- Devuelve solo HTML final.
- No uses Markdown.
- No inventes información.
- Si la información no permite afirmar algo, escribe que no se identifica con la información disponible.
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

  fs.writeFileSync(outputPath, html);

  console.log(`release-doc.html generado en ${outputPath}`);
  console.log(`Proveedor AI usado: ${aiConfig.provider}`);
  console.log(`Modelo AI usado: ${aiConfig.model}`);
}

main().catch((error) => {
  console.error("Error generando documentación:", error.message);
  process.exit(1);
});

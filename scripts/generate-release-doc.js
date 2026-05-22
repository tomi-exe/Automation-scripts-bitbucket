require("dotenv").config();

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const inputPath = path.resolve(process.cwd(), "release-input.json");
const templatePath = path.resolve(
  process.cwd(),
  "templates",
  "release-doc-template.md"
);
const outputPath = path.resolve(process.cwd(), "release-doc.md");
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

function formatJson(value) {
  if (!value) {
    return "No disponible.";
  }

  return JSON.stringify(value, null, 2);
}

function decorateReleaseStatus(markdown, input) {
  const status = getReleaseStatus(input);

  if (!brokenStatuses.includes(status)) {
    return markdown;
  }

  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("# ")) {
      if (!line.includes("[BROKEN]")) {
        lines[index] = line.replace(/^#\s+/, "# [BROKEN] ");
      }

      return lines.join("\n");
    }
  }

  return markdown;
}

async function main() {
  assertFileExists(inputPath, "release-input.json");
  assertFileExists(templatePath, "release-doc-template.md");

  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const template = fs.readFileSync(templatePath, "utf-8");
  const aiConfig = getAiConfig();

  const client = new OpenAI(aiConfig.clientOptions);

  const prompt = `
Genera documentación de release en Markdown para una página web interna.

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

Importante:
Los mensajes de commit son una señal secundaria. Si los commits son vagos o incompletos, prioriza el diff, archivos modificados, snippets de código, rutas detectadas, package.json, documentación existente y salida de tests.

Diff estadístico:
${input.diffStat}

Diff resumido:
${input.diffSummary}

Archivos modificados:
${formatJson(input.changedFiles)}

Fuente autoritativa de cambios:
Los archivos listados en "Archivos modificados", "Diff resumido" y "Resumen por archivo modificado" son la única fuente para decidir qué cambió en este release.

Resumen por archivo modificado:
${formatJson(input.fileSummaries)}

Estructura relevante del proyecto:
${formatJson(input.projectStructure)}

Información de package.json:
${formatJson(input.packageInfo)}

Superficie API detectada:
${formatJson(input.detectedApiSurface)}

Contexto de documentación existente:
${formatJson(input.docsContext)}

Estado del release:
${input.releaseStatus || "unknown"}

Salida de tests:
${input.testOutput || "No hay salida de tests disponible."}

Resumen estructurado de tests:
${formatJson(input.testSummary)}

Reglas obligatorias:
- Devuelve solo Markdown final.
- No uses HTML.
- No inventes información.
- Si la información no permite afirmar algo, escribe que no se identifica con la información disponible.
- No dependas solo del mensaje del commit. Si el commit dice algo genérico, explica los cambios usando evidencia del diff, snippets y archivos modificados.
- Solo declares que algo "cambió", "se agregó", "se corrigió" o "se modificó" si aparece en Archivos modificados, Diff resumido o Resumen por archivo modificado.
- Usa estructura del proyecto, package.json, superficie API detectada y documentación existente solo para entender el contexto del sistema, no como prueba de cambio.
- Si un endpoint, dependencia o comportamiento existe en el proyecto pero no aparece en el diff, descríbelo como contexto existente, no como cambio del release.
- Si la evidencia de cambio es limitada, dilo explícitamente y enfoca la documentación en los archivos realmente modificados.
- En cambios detallados, menciona la evidencia usada: archivo, ruta, endpoint, test o dependencia cuando esté disponible.
- Solo traduzcas endpoints, validaciones, servicios, controladores, tests o dependencias a impacto funcional si aparecen modificados en el diff.
- No conviertas README, estructura del proyecto o superficie API detectada en cambios funcionales si no aparecen en el diff.
- La sección Impacto debe describir solo consecuencias de los archivos modificados. Si solo cambió CI/CD, pipeline, documentación o configuración, el impacto funcional sobre usuarios/API debe decir que no se identifica con la evidencia disponible.
- No menciones endpoints, validaciones, servicios o cambios de API en Impacto salvo que el diff modifique archivos de rutas, app, controllers, services, validators u OpenAPI.
- Si incumples la regla anterior, la documentación se considera incorrecta.
- Si el estado del release es broken, explica qué prueba falló usando la salida de tests disponible.
- Si hay stack trace o assertion error de tests, resume el archivo, nombre del test, diferencia esperada/recibida y causa probable.
- Separa claramente resumen funcional y resumen técnico.
- El resumen funcional debe ser entendible por negocio, PM o QA.
- El resumen técnico debe servir a desarrolladores.
- Mantén la estructura del template.
- Reemplaza todos los placeholders.
- En listas Markdown usa guiones ("- ") para cada ítem.
- No incluyas explicaciones fuera del Markdown.
`;

  const response = await client.chat.completions.create({
    model: aiConfig.model,
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente técnico que genera documentación de releases precisa. Debes distinguir estrictamente entre cambios reales del diff y contexto existente del proyecto.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0,
  });

  const markdown = response.choices[0]?.message?.content;

  if (!markdown) {
    throw new Error("OpenAI no devolvió contenido.");
  }

  const decoratedMarkdown = decorateReleaseStatus(markdown, input);

  fs.writeFileSync(outputPath, decoratedMarkdown);

  console.log(`release-doc.md generado en ${outputPath}`);
  console.log(`Proveedor AI usado: ${aiConfig.provider}`);
  console.log(`Modelo AI usado: ${aiConfig.model}`);
  console.log(`Estado del release: ${getReleaseStatus(input)}`);
}

main().catch((error) => {
  console.error("Error generando documentación:", error.message);
  process.exit(1);
});

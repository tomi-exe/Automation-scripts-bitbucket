# Automation-scripts-bitbucket

Scripts reutilizables para generar documentacion de releases con Groq y publicar una pagina estructurada en Confluence Cloud desde Bitbucket Pipelines.

Este repo vive en GitHub y esta pensado para ser clonado desde pipelines de otros repos. La idea es instalar dependencias y ejecutar la automatizacion contra el repo objetivo usando `TARGET_REPO`. Asi los repos de aplicacion no necesitan cargar ni duplicar estos scripts.

## Requisitos

- Node.js 20
- Groq API key
- Confluence Cloud
- Token de Confluence
- Repo objetivo con historial Git

## Flujo

```text
Bitbucket commits / diff
        ↓
collect-changes.js
        ↓
Groq
        ↓
release-doc.html
        ↓
Confluence API
        ↓
Pagina de release estructurada
```

## Variables de entorno

```env
GROQ_API_KEY=
AI_MODEL=
CONFLUENCE_EMAIL=
CONFLUENCE_API_TOKEN=
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
CONFLUENCE_SPACE_ID=
CONFLUENCE_PARENT_PAGE_ID=
TARGET_REPO=
```

`TARGET_REPO` es opcional. Si no se define, los comandos git se ejecutan sobre el directorio actual.
`CONFLUENCE_SPACE_ID` puede ser el ID numérico del espacio o la key del espacio, por ejemplo `DDS`.

Configurar Groq:

```env
AI_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=
```

## Uso local

```bash
npm install
```

Generar input mock:

```bash
node scripts/generate-sample-release.js
```

Generar documentacion HTML desde el input mock:

```bash
npm run release:generate-doc
```

Ejecutar sample completo hasta publicar:

```bash
npm run release:sample:full
```

## Uso contra un repo objetivo

```bash
TARGET_REPO="../ticket-api-demo" npm run release:collect
npm run release:generate-doc
npm run release:publish
```

Flujo completo:

```bash
TARGET_REPO="../ticket-api-demo" npm run release:docs
```

## Uso desde Bitbucket Pipelines

Ejemplo conceptual desde un repo de aplicacion:

```yaml
image: node:20

pipelines:
  branches:
    main:
      - step:
          name: Test and generate release docs
          script:
            - npm ci
            - npm test
            - cd ..
            - git clone https://x-access-token:${GITHUB_AUTOMATION_TOKEN}@github.com/tomi-exe/Automation-scripts-bitbucket.git
            - cd Automation-scripts-bitbucket
            - npm ci
            - TARGET_REPO="../repo-aplicacion" npm run release:docs
```

Configurar `GITHUB_AUTOMATION_TOKEN` como variable segura en Bitbucket para clonar este repo central desde GitHub si es privado. No usar `AUTOMATION_REPO_TOKEN` para este repo.

## Scripts disponibles

- `npm run release:collect`: recolecta metadata, commits y diffs del repo objetivo.
- `npm run release:generate-doc`: usa Groq para generar `release-doc.html`.
- `npm run release:publish`: publica el HTML en Confluence.
- `npm run release:docs`: ejecuta collect, generate y publish.
- `npm run release:sample`: genera input mock y HTML con OpenAI.
- `npm run release:sample:full`: genera input mock, HTML y publica en Confluence.

## Archivos generados

- `release-input.json`
- `release-doc.html`

Ambos estan ignorados por git.

## Limitaciones

- La calidad de la documentacion depende de commits y diffs claros.
- `git diff HEAD~1 HEAD` requiere historial suficiente.
- Groq y Confluence requieren credenciales reales configuradas en variables seguras.
- El template es HTML simple compatible con Confluence storage.

## Mejoras futuras

- Integracion con Swagger/OpenAPI para enriquecer el contexto funcional y tecnico.
- Comparar contra tags o releases anteriores.
- Agregar enlaces a pull requests y commits.
- Incorporar aprobacion manual antes de publicar.

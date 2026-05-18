# Automation-scripts-bitbucket

Scripts reutilizables para generar documentacion de releases con Groq y publicarla en una web interna desde Bitbucket Pipelines.

Este repo vive en GitHub y esta pensado para ser clonado desde pipelines de otros repos. La idea es instalar dependencias y ejecutar la automatizacion contra el repo objetivo usando `TARGET_REPO`. Asi los repos de aplicacion no necesitan cargar ni duplicar estos scripts.

## Requisitos

- Node.js 20
- Groq API key
- Web interna desplegada, por ejemplo en Vercel
- Endpoint seguro para recibir releases
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
Release Site API
        ↓
Pagina de release estructurada en /proyectos/{projectSlug}/wiki
```

## Variables de entorno

```env
GROQ_API_KEY=
AI_MODEL=
RELEASE_SITE_URL=
RELEASE_SITE_TOKEN=
TARGET_REPO=
```

`TARGET_REPO` es opcional. Si no se define, los comandos git se ejecutan sobre el directorio actual.

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
            - git clone https://github.com/tomi-exe/Automation-scripts-bitbucket.git
            - cd Automation-scripts-bitbucket
            - npm ci
            - TARGET_REPO="../repo-aplicacion" npm run release:docs
```

Como el repo central es publico, no se requiere token de GitHub para clonarlo.

## Troubleshooting

### La web responde 401 Unauthorized

Revisar en Bitbucket:

- `RELEASE_SITE_TOKEN` debe ser el token real esperado por la web.
- No usar valores como `$RELEASE_SITE_TOKEN`.
- No envolver el valor en comillas.

### El log muestra variables como `$AI_MODEL`

Eso significa que la variable fue creada en Bitbucket con el texto literal `$AI_MODEL`.

Corregir el valor en:

```text
Repository settings -> Pipelines -> Repository variables
```

Ejemplo correcto:

```text
AI_MODEL=llama-3.1-8b-instant
```

## Scripts disponibles

- `npm run release:collect`: recolecta metadata, commits y diffs del repo objetivo.
- `npm run release:generate-doc`: usa Groq para generar `release-doc.html`.
- `npm run release:publish`: publica el release en la web interna.
- `npm run release:publish:site`: publica el release en la web interna.
- `npm run release:publish:confluence`: publica el HTML en Confluence, disponible como fallback.
- `npm run release:docs`: ejecuta collect, generate y publish hacia la web interna.
- `npm run release:sample`: genera input mock y HTML con Groq.
- `npm run release:sample:full`: genera input mock, HTML y publica en la web interna.

## Endpoint de la web interna

La web debe exponer un endpoint:

```http
POST /api/release-docs
Authorization: Bearer <RELEASE_SITE_TOKEN>
Content-Type: application/json
```

El script `upload-release-site.js` envia un payload con:

- metadata del proyecto y repositorio;
- estado del release;
- HTML generado por Groq;
- commits y diffs;
- salida de tests;
- ruta sugerida `/proyectos/{projectSlug}/wiki`.

El backend de la web debe decidir como guardar el release en BD y como mostrarlo.

Ver contrato completo sugerido en `docs/release-site-payload.md`.

## Releases con tests fallidos

El repo de aplicacion puede pasar `RELEASE_STATUS=broken` al ejecutar `release:docs`.

Cuando el estado es `broken`:

- La pagina igual se publica en la web interna.
- El titulo principal del HTML se pinta rojo.
- El titulo del release se prefija con `[BROKEN]`.
- Si el pipeline pasa `TEST_OUTPUT_PATH`, Groq resume qué test falló, en qué archivo y por qué.

Ejemplo:

```bash
RELEASE_STATUS=broken TEST_OUTPUT_PATH="$BITBUCKET_CLONE_DIR/test-output.log" TARGET_REPO="$BITBUCKET_CLONE_DIR" npm run release:docs
```

## Archivos generados

- `release-input.json`
- `release-doc.html`

Ambos estan ignorados por git.

## Limitaciones

- La calidad de la documentacion depende de commits y diffs claros.
- `git diff HEAD~1 HEAD` requiere historial suficiente.
- Groq y la web interna requieren credenciales reales configuradas en variables seguras.
- El template es HTML simple para renderizar en la web interna.

## Mejoras futuras

- Integracion con Swagger/OpenAPI para enriquecer el contexto funcional y tecnico.
- Comparar contra tags o releases anteriores.
- Agregar enlaces a pull requests y commits.
- Incorporar aprobacion manual antes de publicar.

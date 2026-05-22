# Automation-scripts-bitbucket

Scripts reutilizables para generar documentacion de releases con Groq y publicarla en Kull desde Bitbucket Pipelines.

Este repo vive en GitHub y esta pensado para ser clonado desde pipelines de otros repos. La idea es instalar dependencias y ejecutar la automatizacion contra el repo objetivo usando `TARGET_REPO`. Asi los repos de aplicacion no necesitan cargar ni duplicar estos scripts.

## Requisitos

- Node.js 20
- Groq API key
- Endpoint productivo de Kull disponible
- Token del webhook de Kull
- Repo objetivo con historial Git

## Flujo

```text
Bitbucket commits / diff
        ↓
collect-changes.js
        ↓
Groq
        ↓
 release-doc.md
        ↓
Kull Commit Docs API
        ↓
Pagina de release en /proyectos/{projectSlug}/wiki
```

## Variables de entorno

```env
AI_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=
KULL_COMMIT_DOCS_URL=https://api-manage.kull.cl/api/commit-docs/webhook
KULL_COMMIT_DOCS_TOKEN=
TARGET_REPO=
```

`TARGET_REPO` es opcional. Si no se define, los comandos git se ejecutan sobre el directorio actual.

En Bitbucket marca como secured:

- `GROQ_API_KEY`
- `KULL_COMMIT_DOCS_TOKEN`

## Uso local

```bash
npm install
```

Generar input mock y documentacion Markdown:

```bash
npm run release:sample
```

Publicar el sample en Kull:

```bash
npm run release:sample:full
```

Para publicar necesitas `KULL_COMMIT_DOCS_TOKEN` real.

## Uso contra un repo objetivo

```bash
TARGET_REPO="../ticket-api-demo" npm run release:collect
npm run release:generate-doc
npm run release:publish:kull
```

Flujo completo:

```bash
TARGET_REPO="../ticket-api-demo" npm run release:docs
```

## Uso desde Bitbucket Pipelines

Para repos con codigo en la raiz:

```yaml
image: node:20

pipelines:
  branches:
    main:
      - step:
          name: Test and publish release docs
          caches:
            - node
          script:
            - npm ci
            - set +e
            - npm test > test-output.log 2>&1
            - TEST_EXIT_CODE=$?
            - cat test-output.log
            - if [ "$TEST_EXIT_CODE" -eq 0 ]; then export RELEASE_STATUS="passed"; else export RELEASE_STATUS="broken"; fi
            - set -e
            - cd ..
            - git clone https://github.com/tomi-exe/Automation-scripts-bitbucket.git
            - cd Automation-scripts-bitbucket
            - npm ci
            - RELEASE_STATUS="$RELEASE_STATUS" TEST_OUTPUT_PATH="$BITBUCKET_CLONE_DIR/test-output.log" TARGET_REPO="$BITBUCKET_CLONE_DIR" npm run release:docs
```

Para repos donde la app vive en `ticket-api-demo`:

```bash
RELEASE_STATUS="$RELEASE_STATUS" TEST_OUTPUT_PATH="$BITBUCKET_CLONE_DIR/ticket-api-demo/test-output.log" TARGET_REPO="$BITBUCKET_CLONE_DIR/ticket-api-demo" npm run release:docs
```

Como el repo central es publico, no se requiere token de GitHub para clonarlo.

## Scripts disponibles

- `npm run release:collect`: recolecta metadata, commits y diffs del repo objetivo.
- `npm run release:generate-doc`: usa Groq para generar `release-doc.md`.
- `npm run release:publish`: publica el release en Kull.
- `npm run release:publish:kull`: publica el release en Kull.
- `npm run release:publish:site`: publica en una web interna generica, disponible como fallback manual.
- `npm run release:publish:confluence`: publica el Markdown (convertido a HTML) en Confluence, disponible como fallback manual.
- `npm run release:docs`: ejecuta collect, generate y publish hacia Kull.
- `npm run release:sample`: genera input mock y Markdown con Groq.
- `npm run release:sample:full`: genera input mock, Markdown y publica en Kull.

## Contexto usado para documentar

La documentacion no depende solo del mensaje del commit. `collect-changes.js` arma `release-input.json` usando varias señales del repo objetivo:

- commits recientes, como contexto secundario;
- archivos modificados con `git diff --name-status HEAD~1 HEAD`;
- diff estadistico y diff resumido;
- diff y snippet limitado por archivo modificado;
- estructura relevante del proyecto con `git ls-files`;
- `package.json`, scripts y dependencias cuando existen;
- endpoints detectados en rutas, controladores o archivos de API;
- contexto de `README.md`, OpenAPI o Swagger si existe;
- salida de tests desde `TEST_OUTPUT_PATH`.

Esto permite que Groq explique cambios reales aunque el commit tenga un mensaje pobre como `update stuff`.

## Payload hacia Kull

El script `upload-kull-commit-docs.js` envia:

- metadata de fuente y fecha;
- proyecto, repositorio y `repository.url`;
- titulo, estado, branch y commit del release;
- Markdown generado por Groq;
- commits y diffs;
- salida de tests;
- ruta sugerida `/proyectos/{projectSlug}/wiki`.

`repository.url` es obligatorio porque Kull lo usa para resolver la wiki correcta. Si el backend no encuentra el proyecto, una respuesta `200 queued` se considera exitosa y queda pendiente para asignacion manual.

Ver contrato completo en `docs/kull-commit-docs-payload.md`.

## Releases con tests fallidos

El repo de aplicacion puede pasar `RELEASE_STATUS=broken` al ejecutar `release:docs`.

Cuando el estado es `broken`:

- La pagina igual se publica en Kull.
- El titulo principal del Markdown se prefija con `[BROKEN]`.
- El titulo del release se prefija con `[BROKEN]`.
- Si el pipeline pasa `TEST_OUTPUT_PATH`, Groq resume que test fallo, en que archivo y por que.

Ejemplo:

```bash
RELEASE_STATUS=broken TEST_OUTPUT_PATH="$BITBUCKET_CLONE_DIR/test-output.log" TARGET_REPO="$BITBUCKET_CLONE_DIR" npm run release:docs
```

## Troubleshooting

### Kull responde 401 Unauthorized

Revisar en Bitbucket:

- `KULL_COMMIT_DOCS_TOKEN` debe ser el token real esperado por Kull.
- No usar valores como `$KULL_COMMIT_DOCS_TOKEN`.
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

## Archivos generados

- `release-input.json`
- `release-doc.md`

Ambos estan ignorados por git.

## Limitaciones

- La calidad de la documentacion depende de commits y diffs claros.
- `git diff HEAD~1 HEAD` requiere historial suficiente.
- Groq y Kull requieren credenciales reales configuradas en variables seguras.
- El template es Markdown simple para renderizar en Kull.

## Mejoras futuras

- Integracion con Swagger/OpenAPI para enriquecer el contexto funcional y tecnico.
- Comparar contra tags o releases anteriores.
- Agregar enlaces a pull requests y commits.
- Incorporar aprobacion manual antes de publicar.

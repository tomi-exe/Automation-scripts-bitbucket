# Release Site Payload

Este es el contrato recomendado para el endpoint de la web interna.

## Endpoint

```http
POST /api/release-docs
Authorization: Bearer <RELEASE_SITE_TOKEN>
Content-Type: application/json
```

## Payload

```json
{
  "source": "bitbucket-pipelines",
  "generatedBy": "Automation-scripts-bitbucket",
  "generatedAt": "2026-05-18T15:30:00.000Z",
  "date": "2026-05-18",
  "project": {
    "key": "DDS",
    "slug": "automation-tests",
    "name": "automation-tests"
  },
  "repository": {
    "fullName": "automation-confluence/automation-tests",
    "slug": "automation-tests",
    "url": "https://bitbucket.org/automation-confluence/automation-tests",
    "targetPath": "/opt/atlassian/pipelines/agent/build"
  },
  "release": {
    "title": "[BROKEN] Release 2026-05-18 - main - e60adbb",
    "status": "broken",
    "branch": "main",
    "commit": "e60adbb1234567890",
    "commitShort": "e60adbb"
  },
  "content": {
    "html": "<h1>Release 2026-05-18 - main</h1><h2>Resumen funcional</h2><p>...</p>"
  },
  "changes": {
    "commits": "e60adbb - feat: add healthcheck metadata (Demo Dev)",
    "diffStat": "ticket-api-demo/src/app.js | 4 +++-",
    "diffSummary": "diff --git a/ticket-api-demo/src/app.js b/ticket-api-demo/src/app.js\n..."
  },
  "tests": {
    "status": "failed",
    "failed": true,
    "output": "FAIL tests/tickets.test.js\nInternal Ticket API › GET /health returns service status\n..."
  },
  "routing": {
    "wikiPath": "/proyectos/automation-tests/wiki",
    "projectSlugSource": "repository.slug"
  }
}
```

## Campos obligatorios recomendados

```json
{
  "date": "2026-05-18",
  "project": {
    "slug": "automation-tests"
  },
  "repository": {
    "fullName": "automation-confluence/automation-tests",
    "slug": "automation-tests"
  },
  "release": {
    "title": "Release 2026-05-18 - main - e60adbb",
    "status": "passed",
    "branch": "main",
    "commit": "e60adbb1234567890"
  },
  "content": {
    "html": "<h1>...</h1>"
  }
}
```

## Logica esperada en el backend

1. Validar `Authorization: Bearer <RELEASE_SITE_TOKEN>`.
2. Validar payload.
3. Resolver proyecto:

```ts
const projectSlug = body.project?.slug || body.repository.slug
```

4. Buscar o crear proyecto.
5. Guardar release asociado al proyecto.
6. Mostrarlo en:

```text
/proyectos/{projectSlug}/wiki
```

## Respuesta sugerida

```json
{
  "ok": true,
  "releaseId": "rel_123",
  "projectSlug": "automation-tests",
  "wikiPath": "/proyectos/automation-tests/wiki",
  "url": "https://tu-web.vercel.app/proyectos/automation-tests/wiki/releases/rel_123"
}
```

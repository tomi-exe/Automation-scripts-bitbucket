# Kull Commit Docs Payload

El publicador default envia releases al endpoint:

```http
POST https://api-manage.kull.cl/api/commit-docs/webhook
Authorization: Bearer <KULL_COMMIT_DOCS_TOKEN>
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
    "url": "https://bitbucket.org/automation-confluence/automation-tests",
    "fullName": "automation-confluence/automation-tests",
    "slug": "automation-tests",
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
    "html": "<h1>...</h1>"
  },
  "changes": {
    "commits": "...",
    "diffStat": "...",
    "diffSummary": "..."
  },
  "tests": {
    "status": "failed",
    "failed": true,
    "output": "..."
  },
  "routing": {
    "wikiPath": "/proyectos/automation-tests/wiki",
    "projectSlugSource": "repository.slug"
  }
}
```

## Campos importantes

- `repository.url`: obligatorio. Kull lo usa para resolver automaticamente el proyecto/wiki correcta.
- `release.commit`: se envia siempre que exista para permitir idempotencia.
- `release.status`: permite marcar releases `passed`, `broken`, `failed` o `error`.
- `content.html`: HTML simple generado por Groq.
- `tests.output`: salida de tests capturada por el pipeline.

## Respuestas esperadas

- `200 created`: release creado.
- `200 updated`: release actualizado.
- `200 queued`: Kull no encontro asignacion automatica y deja el documento pendiente. Para el pipeline cuenta como exito.
- `400`: payload invalido.
- `401`: token ausente o invalido.
- `5xx` o timeout: el script reintenta con backoff de 5s, 15s y 60s.

## Variables

```env
KULL_COMMIT_DOCS_URL=https://api-manage.kull.cl/api/commit-docs/webhook
KULL_COMMIT_DOCS_TOKEN=
```

`KULL_COMMIT_DOCS_TOKEN` nunca debe guardarse en git. Configuralo como variable secured en Bitbucket.

const fs = require("fs");
const path = require("path");

const outputPath = path.resolve(process.cwd(), "release-input.json");

const payload = {
  date: new Date().toISOString().slice(0, 10),
  repo: "ticket-api-demo",
  repoFullName: "automation-confluence/automation-tests",
  repoSlug: "automation-tests",
  repoUrl: "https://bitbucket.org/automation-confluence/automation-tests",
  projectKey: "DDS",
  branch: "main",
  commit: "abc1234",
  targetRepo: "sample",
  releaseStatus: process.env.RELEASE_STATUS || "unknown",
  testOutput: process.env.RELEASE_STATUS === "broken"
    ? [
        "FAIL tests/tickets.test.js",
        "Internal Ticket API › GET /health returns service status",
        "expect(received).toEqual(expected) // deep equality",
        "+   \"environment\": \"test\"",
        "+   \"timestamp\": \"2026-05-05T05:26:25.100Z\"",
        "+   \"version\": \"1.0.1\"",
        "Test Suites: 1 failed, 1 total",
        "Tests: 1 failed, 7 passed, 8 total",
      ].join("\n")
    : "Todos los tests pasaron.",
  commits: [
    "a1b2c3d - feat: create base ticket API (Demo Dev)",
    "b2c3d4e - feat: add ticket validation rules (Demo Dev)",
    "c3d4e5f - fix: restrict ticket priority values (Demo Dev)",
    "d4e5f6g - refactor: move ticket logic into service layer (Demo Dev)",
    "e5f6g7h - test: add ticket endpoint coverage (Demo Dev)",
  ].join("\n"),
  diffStat: [
    " src/controllers/tickets.controller.js | 42 ++++++++++++++",
    " src/services/tickets.service.js       | 58 ++++++++++++++++++++",
    " src/validators/tickets.validator.js   | 31 +++++++++++",
    " tests/tickets.test.js                 | 76 +++++++++++++++++++++++++++",
    " 4 files changed, 207 insertions(+)",
  ].join("\n"),
  diffSummary: `
diff --git a/src/validators/tickets.validator.js b/src/validators/tickets.validator.js
+ const allowedPriorities = ["low", "medium", "high"];
+ const allowedStatuses = ["open", "in_progress", "resolved"];
+ validate required fields: title, description

diff --git a/src/services/tickets.service.js b/src/services/tickets.service.js
+ move ticket creation and status update logic into service layer

diff --git a/tests/tickets.test.js b/tests/tickets.test.js
+ add coverage for ticket creation, priority validation and status update
`,
};

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

console.log(`release-input.json sample generado en ${outputPath}`);

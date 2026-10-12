import assert from "node:assert/strict";
import test from "node:test";
import { executeInRunner, executeTestInRunner } from "../src/services/codeRunner.js";

test("forwards fixed Judge0 language IDs, limits, and authentication", async () => {
  const originalFetch = global.fetch;
  const originalEnvironment = {
    JUDGE0_BASE_URL: process.env.JUDGE0_BASE_URL,
    JUDGE0_AUTH_HEADER: process.env.JUDGE0_AUTH_HEADER,
    JUDGE0_AUTH_TOKEN: process.env.JUDGE0_AUTH_TOKEN,
    JUDGE0_RAPID_API_KEY: process.env.JUDGE0_RAPID_API_KEY,
    JUDGE0_RAPID_API_HOST: process.env.JUDGE0_RAPID_API_HOST,
    JUDGE0_JAVASCRIPT_LANGUAGE_ID: process.env.JUDGE0_JAVASCRIPT_LANGUAGE_ID,
    JUDGE0_PYTHON_LANGUAGE_ID: process.env.JUDGE0_PYTHON_LANGUAGE_ID,
  };
  let capturedRequest;

  process.env.JUDGE0_BASE_URL = "https://judge0.example";
  process.env.JUDGE0_AUTH_HEADER = "X-Auth-Token";
  process.env.JUDGE0_AUTH_TOKEN = "test-token";
  delete process.env.JUDGE0_RAPID_API_KEY;
  delete process.env.JUDGE0_RAPID_API_HOST;
  process.env.JUDGE0_JAVASCRIPT_LANGUAGE_ID = "63";
  process.env.JUDGE0_PYTHON_LANGUAGE_ID = "71";
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return new Response(
      JSON.stringify({
        stdout: "5\n",
        stderr: null,
        compile_output: null,
        message: null,
        status: { id: 3, description: "Accepted" },
        time: "0.012",
        memory: 1_000,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await executeInRunner({
      language: "javascript",
      source: "console.log(2 + 3)",
      stdin: "",
    });
    const runnerRequest = JSON.parse(capturedRequest.options.body);

    assert.equal(
      capturedRequest.url,
      "https://judge0.example/submissions?base64_encoded=false&wait=true&fields=stdout,stderr,compile_output,message,status,time,memory"
    );
    assert.equal(capturedRequest.options.headers["X-Auth-Token"], "test-token");
    assert.equal(runnerRequest.language_id, 63);
    assert.equal(runnerRequest.source_code, "console.log(2 + 3)");
    assert.equal(runnerRequest.cpu_time_limit, 2);
    assert.equal(runnerRequest.memory_limit, 128 * 1024);
    assert.equal(runnerRequest.max_processes_and_or_threads, 32);
    assert.deepEqual(result.run, {
      stdout: "5\n",
      stderr: "",
      code: 0,
      signal: null,
      message: null,
      status: null,
      wallTime: 12,
      memory: 1_000 * 1024,
    });

    await executeTestInRunner({
      language: "python",
      source: "print(2 + 3)",
      stdin: "",
      requestTimeoutMs: 2_000,
    });
    const testRunnerRequest = JSON.parse(capturedRequest.options.body);

    assert.equal(testRunnerRequest.language_id, 71);
    assert.equal(testRunnerRequest.cpu_time_limit, 1);
    assert.equal(testRunnerRequest.wall_time_limit, 1.5);

    process.env.JUDGE0_RAPID_API_KEY = "rapid-test-token";
    process.env.JUDGE0_RAPID_API_HOST = "judge0.example";

    await executeInRunner({
      language: "javascript",
      source: "console.log(2 + 3)",
      stdin: "",
    });

    assert.equal(capturedRequest.options.headers["X-RapidAPI-Key"], "rapid-test-token");
    assert.equal(capturedRequest.options.headers["X-RapidAPI-Host"], "judge0.example");
    assert.equal(capturedRequest.options.headers["X-Auth-Token"], undefined);
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

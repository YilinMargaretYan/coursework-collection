const RUNNER_REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_TEXT_LENGTH = 16 * 1024;

const RUNNER_LIMITS = Object.freeze({
  cpu_time_limit: 2,
  cpu_extra_time: 0,
  wall_time_limit: 3,
  memory_limit: 128 * 1024,
  stack_limit: 64 * 1024,
  max_processes_and_or_threads: 32,
  max_file_size: 1024,
});

const TEST_RUNNER_LIMITS = Object.freeze({
  ...RUNNER_LIMITS,
  cpu_time_limit: 1,
  wall_time_limit: 1.5,
});

const languageConfiguration = {
  javascript: "JUDGE0_JAVASCRIPT_LANGUAGE_ID",
  python: "JUDGE0_PYTHON_LANGUAGE_ID",
};

const RAPID_API_DEFAULT_HOST = "judge0-ce.p.rapidapi.com";

export class RunnerConfigurationError extends Error {}
export class RunnerUnavailableError extends Error {}
export class RunnerResponseError extends Error {}

function getRunnerConfiguration(language) {
  const languageIdEnvironmentVariable = languageConfiguration[language];
  const baseUrl = process.env.JUDGE0_BASE_URL;
  const languageId = Number(process.env[languageIdEnvironmentVariable]);

  if (!languageIdEnvironmentVariable || !baseUrl || !Number.isInteger(languageId) || languageId <= 0) {
    throw new RunnerConfigurationError("The Judge0 runner is not configured");
  }

  let runnerUrl;

  try {
    runnerUrl = new URL(baseUrl);
  } catch {
    throw new RunnerConfigurationError("JUDGE0_BASE_URL is not a valid URL");
  }

  if (!["http:", "https:"].includes(runnerUrl.protocol)) {
    throw new RunnerConfigurationError("JUDGE0_BASE_URL must use HTTP or HTTPS");
  }

  const rapidApiKey = process.env.JUDGE0_RAPID_API_KEY;
  let headers;

  if (rapidApiKey) {
    const rapidApiHost = process.env.JUDGE0_RAPID_API_HOST || RAPID_API_DEFAULT_HOST;

    if (runnerUrl.hostname !== rapidApiHost) {
      throw new RunnerConfigurationError(
        "JUDGE0_BASE_URL must match JUDGE0_RAPID_API_HOST when using a RapidAPI key"
      );
    }

    headers = {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": rapidApiHost,
    };
  } else {
    const token = process.env.JUDGE0_AUTH_TOKEN;
    const authenticationHeader = process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token";

    if (!token || !/^[A-Za-z0-9-]+$/.test(authenticationHeader)) {
      throw new RunnerConfigurationError("The Judge0 runner is not configured");
    }

    headers = { [authenticationHeader]: token };
  }

  return {
    endpoint: `${runnerUrl.toString().replace(/\/$/, "")}/submissions?base64_encoded=false&wait=true&fields=stdout,stderr,compile_output,message,status,time,memory`,
    headers,
    languageId,
  };
}

function truncate(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.slice(0, MAX_RESPONSE_TEXT_LENGTH);
}

function getStatus(submission) {
  if (submission.status?.id === 3) {
    return null;
  }

  if (/time limit/i.test(submission.status?.description || "")) {
    return "TO";
  }

  return "RE";
}

function getWallTimeInMilliseconds(time) {
  const seconds = Number(time);
  return Number.isFinite(seconds) ? seconds * 1_000 : null;
}

function getMemoryInBytes(memory) {
  return typeof memory === "number" ? memory * 1024 : null;
}

function serializeSubmission(submission) {
  const status = getStatus(submission);
  const runnerMessage = truncate(
    submission.message || (status ? submission.status?.description : "")
  );
  const compileOutput = truncate(submission.compile_output);

  return {
    compile: compileOutput
      ? {
          stdout: "",
          stderr: compileOutput,
          code: status ? 1 : 0,
          signal: null,
          message: null,
          status,
          wallTime: null,
          memory: null,
        }
      : null,
    run: {
      stdout: truncate(submission.stdout),
      stderr: truncate(submission.stderr),
      code: status ? 1 : 0,
      signal: null,
      message: runnerMessage || null,
      status,
      wallTime: getWallTimeInMilliseconds(submission.time),
      memory: getMemoryInBytes(submission.memory),
    },
  };
}

async function executeWithLimits({ language, source, stdin, limits, requestTimeoutMs }) {
  const config = getRunnerConfiguration(language);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify({
        source_code: source,
        language_id: config.languageId,
        stdin,
        ...limits,
      }),
      redirect: "error",
      signal: abortController.signal,
    });

    let responseBody;

    try {
      responseBody = await response.json();
    } catch {
      throw new RunnerResponseError("Judge0 returned an invalid response");
    }

    if (!response.ok) {
      throw new RunnerResponseError("Judge0 rejected the request");
    }

    return {
      language,
      version: String(config.languageId),
      ...serializeSubmission(responseBody),
    };
  } catch (error) {
    if (error instanceof RunnerResponseError) {
      throw error;
    }

    throw new RunnerUnavailableError("Judge0 could not be reached");
  } finally {
    clearTimeout(timeout);
  }
}

export function executeInRunner({ language, source, stdin }) {
  return executeWithLimits({
    language,
    source,
    stdin,
    limits: RUNNER_LIMITS,
    requestTimeoutMs: RUNNER_REQUEST_TIMEOUT_MS,
  });
}

export function executeTestInRunner({ language, source, stdin, requestTimeoutMs }) {
  return executeWithLimits({
    language,
    source,
    stdin,
    limits: TEST_RUNNER_LIMITS,
    requestTimeoutMs: Math.min(requestTimeoutMs, 2_000),
  });
}

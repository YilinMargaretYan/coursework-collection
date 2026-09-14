import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router";
import Navbar from "../components/Navbar.jsx";
import StudyHelperPanel from "../components/StudyHelperPanel.jsx";
import api from "../lib/axios.js";

const createCell = (type) => ({
  clientId: crypto.randomUUID(),
  type,
  content: "",
  language: type === "code" ? "javascript" : "plaintext",
  testCases: [],
});

const createTestCase = (number) => ({
  clientId: crypto.randomUUID(),
  name: `Test ${number}`,
  input: "",
  expectedOutput: "",
});

const MAX_VISIBLE_TEST_CASES = 15;
const RUNNABLE_LANGUAGES = new Set(["javascript", "python"]);

const getExecutionMessage = (stage) => {
  if (!stage) {
    return "";
  }

  return [stage.stdout, stage.stderr, stage.message].filter(Boolean).join("\n");
};

const getExecutionStatus = (result) => {
  const stage = result?.run || result?.compile;

  if (!stage) {
    return { label: "No result", className: "badge-ghost" };
  }

  if (stage.status === "TO") {
    return { label: "Timed out", className: "badge-warning" };
  }

  if (stage.status || stage.code !== 0) {
    return { label: "Error", className: "badge-error" };
  }

  return { label: "Finished", className: "badge-success" };
};

const getTestResultLabel = (result) => {
  if (result.passed) {
    return { label: "Passed", className: "badge-success" };
  }

  if (result.status === "TO") {
    return { label: "Timed out", className: "badge-warning" };
  }

  return { label: "Did not pass", className: "badge-error" };
};

const findTestResult = (testRun, testCase) =>
  testRun?.result?.results?.find((result) => result.id === testCase._id);

const NotebookPage = () => {
  const { id } = useParams();
  const [notebook, setNotebook] = useState(null);
  const [title, setTitle] = useState("");
  const [cells, setCells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState(null);

  const selectedCell = cells.find((cell) => (cell._id || cell.clientId) === selectedCellId) || null;
  const [executions, setExecutions] = useState({});
  const [testRuns, setTestRuns] = useState({});
  const [pendingSavedCellChanges, setPendingSavedCellChanges] = useState({});

  useEffect(() => {
    const fetchNotebook = async () => {
      try {
        const response = await api.get(`/notebooks/${id}`);
        setNotebook(response.data);
        setTitle(response.data.title);
        setCells(response.data.cells);
        setPendingSavedCellChanges({});
      } catch (error) {
        console.error("Error loading notebook", error);
        toast.error("Failed to load this notebook");
      } finally {
        setLoading(false);
      }
    };

    fetchNotebook();
  }, [id]);

  const updateCell = (index, changes) => {
    setCells((currentCells) =>
      currentCells.map((cell, cellIndex) => (cellIndex === index ? { ...cell, ...changes } : cell))
    );
  };

  const updateTestCase = (cellIndex, testIndex, changes) => {
    const cell = cells[cellIndex];

    setCells((currentCells) =>
      currentCells.map((cell, currentCellIndex) => {
        if (currentCellIndex !== cellIndex) {
          return cell;
        }

        return {
          ...cell,
          testCases: (cell.testCases || []).map((testCase, currentTestIndex) =>
            currentTestIndex === testIndex ? { ...testCase, ...changes } : testCase
          ),
        };
      })
    );

    if (cell) {
      markSavedCellChange(cell);
    }
  };

  const addTestCase = (cellIndex) => {
    const cell = cells[cellIndex];

    setCells((currentCells) =>
      currentCells.map((cell, currentCellIndex) => {
        if (currentCellIndex !== cellIndex) {
          return cell;
        }

        const testCases = cell.testCases || [];
        return { ...cell, testCases: [...testCases, createTestCase(testCases.length + 1)] };
      })
    );

    if (cell) {
      markSavedCellChange(cell);
    }
  };

  const removeTestCase = (cellIndex, testIndex) => {
    const cell = cells[cellIndex];

    setCells((currentCells) =>
      currentCells.map((cell, currentCellIndex) =>
        currentCellIndex === cellIndex
          ? { ...cell, testCases: (cell.testCases || []).filter((_, index) => index !== testIndex) }
          : cell
      )
    );

    if (cell) {
      markSavedCellChange(cell);
    }
  };

  const updateExecution = (cell, changes) => {
    const executionKey = cell._id || cell.clientId;

    setExecutions((currentExecutions) => ({
      ...currentExecutions,
      [executionKey]: { ...currentExecutions[executionKey], ...changes },
    }));
  };

  const updateTestRun = (cell, changes) => {
    const executionKey = cell._id || cell.clientId;

    setTestRuns((currentTestRuns) => ({
      ...currentTestRuns,
      [executionKey]: { ...currentTestRuns[executionKey], ...changes },
    }));
  };

  const clearTestRun = (cell) => {
    updateTestRun(cell, { error: "", result: null });
  };

  const markSavedCellChange = (cell) => {
    const executionKey = cell._id || cell.clientId;

    setPendingSavedCellChanges((currentChanges) => ({ ...currentChanges, [executionKey]: true }));
    clearTestRun(cell);
  };

  const handleRun = async (cell) => {
    if (!cell._id) {
      toast.error("Save the notebook before running a new code cell");
      return;
    }

    if (pendingSavedCellChanges[cell._id]) {
      toast.error("Save after changing the cell type or language before running it");
      return;
    }

    const executionKey = cell._id;
    const execution = executions[executionKey] || {};
    updateExecution(cell, { error: "", isRunning: true, result: null });

    try {
      const response = await api.post(`/notebooks/${id}/cells/${cell._id}/run`, {
        source: cell.content,
        stdin: execution.stdin || "",
      });
      updateExecution(cell, { isRunning: false, result: response.data });
    } catch (error) {
      const message = error.response?.data?.message || "Unable to run this code cell";
      console.error("Error running code cell", error);
      updateExecution(cell, { error: message, isRunning: false });
    }
  };

  const handleRunTests = async (cell) => {
    if (!cell._id) {
      toast.error("Save the notebook before running visible tests");
      return;
    }

    if (pendingSavedCellChanges[cell._id]) {
      toast.error("Save test cases and language changes before running visible tests");
      return;
    }

    if (!cell.testCases?.length) {
      toast.error("Add at least one visible test case first");
      return;
    }

    updateTestRun(cell, { error: "", isRunning: true, result: null });

    try {
      const response = await api.post(`/notebooks/${id}/cells/${cell._id}/run-tests`, {
        source: cell.content,
      });
      updateTestRun(cell, { isRunning: false, result: response.data });
    } catch (error) {
      const message = error.response?.data?.message || "Unable to run visible tests";
      console.error("Error running visible tests", error);
      updateTestRun(cell, { error: message, isRunning: false });
    }
  };

  const moveCell = (index, direction) => {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= cells.length) {
      return;
    }

    const reorderedCells = [...cells];
    [reorderedCells[index], reorderedCells[nextIndex]] = [
      reorderedCells[nextIndex],
      reorderedCells[index],
    ];
    setCells(reorderedCells);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("A notebook title is required");
      return;
    }

    setSaving(true);

    try {
      await api.put(`/notebooks/${id}`, { title });
      const response = await api.put(`/notebooks/${id}/cells`, {
        cells: cells.map((cell) => ({
          _id: cell._id,
          type: cell.type,
          content: cell.content,
          language: cell.language,
          testCases:
            cell.type === "code"
              ? (cell.testCases || []).map((testCase) => ({
                  _id: testCase._id,
                  name: testCase.name,
                  input: testCase.input,
                  expectedOutput: testCase.expectedOutput,
                }))
              : [],
        })),
      });
      setNotebook(response.data);
      setTitle(response.data.title);
      setCells(response.data.cells);
      setPendingSavedCellChanges({});
      toast.success("Notebook saved");
    } catch (error) {
      console.error("Error saving notebook", error);
      toast.error("Failed to save notebook");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-primary">Loading notebook...</div>;
  }

  if (!notebook) {
    return <div className="p-8">Notebook not found.</div>;
  }

  return (
    <div className="min-h-screen bg-base-200">
      <Navbar />

      <main className="mx-auto max-w-5xl p-4 py-8">
        <Link className="btn btn-ghost mb-6" to={`/course/${notebook.courseId}`}>
          Back to Course
        </Link>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="form-control flex-1">
            <span className="label-text mb-2">Notebook title</span>
            <input
              className="input input-bordered w-full text-xl"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave} type="button">
            {saving ? "Saving..." : "Save Notebook"}
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button className="btn btn-outline" onClick={() => setCells((current) => [...current, createCell("markdown")])} type="button">
            Add Markdown Cell
          </button>
          <button className="btn btn-outline" onClick={() => setCells((current) => [...current, createCell("code")])} type="button">
            Add Code Cell
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            {cells.map((cell, index) => {
              const cellId = cell._id || cell.clientId;

              return (
            <section className={`card bg-base-100 shadow-sm ${selectedCellId === cellId ? "ring-2 ring-primary" : ""}`} key={cellId}>
              <div className="card-body">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="badge badge-outline">Cell {index + 1}</span>
                    <select
                      className="select select-bordered select-sm"
                      onChange={(event) => {
                        updateCell(index, {
                          type: event.target.value,
                          language: event.target.value === "code" ? "javascript" : "plaintext",
                          testCases: event.target.value === "code" ? cell.testCases || [] : [],
                        });
                        updateExecution(cell, { error: "", result: null });
                        markSavedCellChange(cell);
                      }}
                      value={cell.type}
                    >
                      <option value="markdown">Markdown</option>
                      <option value="code">Code</option>
                    </select>
                    {cell.type === "code" && (
                      <select
                        className="select select-bordered select-sm"
                        onChange={(event) => {
                          updateCell(index, { language: event.target.value });
                          updateExecution(cell, { error: "", result: null });
                          markSavedCellChange(cell);
                        }}
                        value={cell.language}
                      >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="html">HTML</option>
                        <option value="css">CSS</option>
                        <option value="plaintext">Plain text</option>
                      </select>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedCellId(cellId)}
                      type="button"
                    >
                      Use with Helper
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => moveCell(index, -1)} type="button">
                      Move up
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={index === cells.length - 1}
                      onClick={() => moveCell(index, 1)}
                      type="button"
                    >
                      Move down
                    </button>
                    <button
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => setCells((currentCells) => currentCells.filter((_, cellIndex) => cellIndex !== index))}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <textarea
                  className="textarea textarea-bordered min-h-40 w-full font-mono"
                  onChange={(event) => {
                    updateCell(index, { content: event.target.value });
                    if (cell.type === "code") {
                      updateExecution(cell, { error: "", result: null });
                      clearTestRun(cell);
                    }
                  }}
                  placeholder={cell.type === "markdown" ? "Write Markdown here..." : "Write code here..."}
                  value={cell.content}
                />

                {cell.type === "code" && (
                  <>
                    <div className="rounded-lg border border-base-300 bg-base-200/50 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Run code</h3>
                          <p className="text-sm text-base-content/70">
                            Code runs in the private sandbox after the notebook server checks it.
                          </p>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={
                            !cell._id ||
                            !RUNNABLE_LANGUAGES.has(cell.language) ||
                            executions[cell._id]?.isRunning
                          }
                          onClick={() => handleRun(cell)}
                          type="button"
                        >
                          {executions[cell._id]?.isRunning ? "Running..." : "Run Code"}
                        </button>
                      </div>

                      {!cell._id && (
                        <p className="text-sm text-warning">Save this new code cell before running it.</p>
                      )}

                      {cell._id && !RUNNABLE_LANGUAGES.has(cell.language) && (
                        <p className="text-sm text-warning">Only JavaScript and Python are runnable in Project 2.</p>
                      )}

                      <label className="form-control">
                        <span className="label-text mb-1">Standard input (optional)</span>
                        <textarea
                          className="textarea textarea-bordered min-h-24 font-mono"
                          maxLength="8192"
                          onChange={(event) => updateExecution(cell, { stdin: event.target.value })}
                          placeholder="Text passed to the program..."
                          value={executions[cell._id || cell.clientId]?.stdin || ""}
                        />
                      </label>

                      {executions[cell._id || cell.clientId]?.error && (
                        <div className="alert alert-error mt-4 text-sm" role="alert">
                          {executions[cell._id || cell.clientId].error}
                        </div>
                      )}

                      {executions[cell._id || cell.clientId]?.result && (() => {
                        const result = executions[cell._id || cell.clientId].result;
                        const status = getExecutionStatus(result);
                        const compileMessage = getExecutionMessage(result.compile);
                        const runMessage = getExecutionMessage(result.run);

                        return (
                          <div className="mt-4 rounded-md border border-base-300 bg-base-100 p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-semibold">Last run</h4>
                              <span className={`badge ${status.className}`}>{status.label}</span>
                            </div>

                            {compileMessage && (
                              <div className="mb-3">
                                <p className="mb-1 text-sm font-medium">Compilation</p>
                                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-base-200 p-3 text-sm">
                                  {compileMessage}
                                </pre>
                              </div>
                            )}

                            <div>
                              <p className="mb-1 text-sm font-medium">Program output</p>
                              <pre className="min-h-16 overflow-x-auto whitespace-pre-wrap rounded bg-base-200 p-3 text-sm">
                                {runMessage || "(no output)"}
                              </pre>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="rounded-lg border border-base-300 bg-base-200/50 p-4">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">Visible test cases</h3>
                          <p className="text-sm text-base-content/70">
                            Each test provides input and the output learners should expect.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={(cell.testCases || []).length >= MAX_VISIBLE_TEST_CASES}
                            onClick={() => addTestCase(index)}
                            type="button"
                          >
                            Add Test Case
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={
                              !cell._id ||
                              !RUNNABLE_LANGUAGES.has(cell.language) ||
                              !(cell.testCases || []).length ||
                              pendingSavedCellChanges[cell._id] ||
                              testRuns[cell._id]?.isRunning
                            }
                            onClick={() => handleRunTests(cell)}
                            type="button"
                          >
                            {testRuns[cell._id]?.isRunning ? "Running Tests..." : "Run Visible Tests"}
                          </button>
                        </div>
                      </div>

                      {pendingSavedCellChanges[cell._id || cell.clientId] && (
                        <p className="mb-4 text-sm text-warning">Save test and language changes before running tests.</p>
                      )}

                      {testRuns[cell._id || cell.clientId]?.error && (
                        <div className="alert alert-error mb-4 text-sm" role="alert">
                          {testRuns[cell._id || cell.clientId].error}
                        </div>
                      )}

                      {testRuns[cell._id || cell.clientId]?.result?.summary && (
                        <p className="mb-4 text-sm font-medium">
                          {testRuns[cell._id || cell.clientId].result.summary.passed}/
                          {testRuns[cell._id || cell.clientId].result.summary.total} tests passed
                        </p>
                      )}

                      <div className="space-y-4">
                        {(cell.testCases || []).map((testCase, testIndex) => {
                          const testResult = findTestResult(
                            testRuns[cell._id || cell.clientId],
                            testCase
                          );
                          const testResultLabel = testResult && getTestResultLabel(testResult);

                          return (
                            <fieldset
                              className="rounded-md border border-base-300 bg-base-100 p-3"
                              key={testCase._id || testCase.clientId}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <label className="form-control flex-1">
                                  <span className="label-text mb-1">Test name</span>
                                  <input
                                    className="input input-bordered input-sm w-full"
                                    maxLength="120"
                                    onChange={(event) =>
                                      updateTestCase(index, testIndex, { name: event.target.value })
                                    }
                                    value={testCase.name}
                                  />
                                </label>
                                <button
                                  className="btn btn-ghost btn-sm self-end text-error"
                                  onClick={() => removeTestCase(index, testIndex)}
                                  type="button"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="form-control">
                                  <span className="label-text mb-1">Input</span>
                                  <textarea
                                    className="textarea textarea-bordered min-h-24 font-mono"
                                    maxLength="8192"
                                    onChange={(event) =>
                                      updateTestCase(index, testIndex, { input: event.target.value })
                                    }
                                    placeholder="What the program receives..."
                                    value={testCase.input}
                                  />
                                </label>
                                <label className="form-control">
                                  <span className="label-text mb-1">Expected output</span>
                                  <textarea
                                    className="textarea textarea-bordered min-h-24 font-mono"
                                    maxLength="8192"
                                    onChange={(event) =>
                                      updateTestCase(index, testIndex, { expectedOutput: event.target.value })
                                    }
                                    placeholder="What the program should print..."
                                    value={testCase.expectedOutput}
                                  />
                                </label>
                              </div>

                              {testResult && (
                                <div className="mt-3 rounded bg-base-200 p-3 text-sm">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className={`badge ${testResultLabel.className}`}>
                                      {testResultLabel.label}
                                    </span>
                                    {testResult.status && <span>{testResult.status}</span>}
                                  </div>
                                  {!testResult.passed && (
                                    <>
                                      <p className="mb-1 font-medium">Actual output</p>
                                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono">
                                        {testResult.actualOutput || testResult.message || "(no output)"}
                                      </pre>
                                    </>
                                  )}
                                </div>
                              )}
                            </fieldset>
                          );
                        })}
                      </div>

                      {(cell.testCases || []).length === 0 && (
                        <p className="text-sm text-base-content/70">No visible tests yet.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
              );
            })}

            {cells.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-base-content/70">
                This notebook is empty. Add a Markdown or code cell above.
              </p>
            )}
          </div>

          <StudyHelperPanel cells={cells} selectedCell={selectedCell} />
        </div>
      </main>
    </div>
  );
};

export default NotebookPage;

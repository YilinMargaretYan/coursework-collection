import mongoose from "mongoose";
import Course from "../models/Course.js";
import Notebook from "../models/Notebook.js";
import {
  executeInRunner,
  executeTestInRunner,
  RunnerConfigurationError,
  RunnerResponseError,
  RunnerUnavailableError,
} from "../services/codeRunner.js";

const isValidId = (id) => mongoose.isValidObjectId(id);
const MAX_TEST_CASES = 15;
const MAX_TEST_TEXT_LENGTH = 8 * 1024;
const MAX_TEST_NAME_LENGTH = 120;
const MAX_SOURCE_LENGTH = 64 * 1024;
const MAX_STANDARD_INPUT_LENGTH = 8 * 1024;
const MAX_TEST_SUITE_DURATION_MS = 15_000;
const EXECUTABLE_LANGUAGES = new Set(["javascript", "python"]);

function normalizeOutput(output) {
  return output.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
}

function getValidatedTestCases(testCases) {
  if (testCases === undefined) {
    return { testCases: [] };
  }

  if (!Array.isArray(testCases)) {
    return { error: "testCases must be an array" };
  }

  if (testCases.length > MAX_TEST_CASES) {
    return { error: `A code cell can have at most ${MAX_TEST_CASES} visible test cases` };
  }

  const normalizedTestCases = [];

  for (let index = 0; index < testCases.length; index += 1) {
    const testCase = testCases[index];

    if (!testCase || typeof testCase !== "object") {
      return { error: `Test case ${index + 1} must be an object` };
    }

    const name = typeof testCase.name === "string" ? testCase.name.trim() : "";

    if (!name) {
      return { error: `Test case ${index + 1} needs a name` };
    }

    if (name.length > MAX_TEST_NAME_LENGTH) {
      return { error: `Test case ${index + 1} has a name that is too long` };
    }

    if (typeof testCase.input !== "string" || typeof testCase.expectedOutput !== "string") {
      return { error: `Test case ${index + 1} input and expected output must be text` };
    }

    if (
      testCase.input.length > MAX_TEST_TEXT_LENGTH ||
      testCase.expectedOutput.length > MAX_TEST_TEXT_LENGTH
    ) {
      return { error: `Test case ${index + 1} input and expected output must each be 8 KiB or smaller` };
    }

    normalizedTestCases.push({
      _id: testCase._id,
      name,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
    });
  }

  return { testCases: normalizedTestCases };
}

export async function getNotebooksByCourse(req, res) {
  const { courseId } = req.query;

  if (!isValidId(courseId)) {
    return res.status(400).json({ message: "A valid courseId is required" });
  }

  try {
    const notebooks = await Notebook.find({ courseId }).sort({ position: 1 });
    res.status(200).json(notebooks);
  } catch (error) {
    console.error("Error in getNotebooksByCourse controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getNotebookById(req, res) {
  try {
    const notebook = await Notebook.findById(req.params.id);

    if (!notebook) {
      return res.status(404).json({ message: "Notebook not found" });
    }

    res.status(200).json(notebook);
  } catch (error) {
    console.error("Error in getNotebookById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createNotebook(req, res) {
  const { courseId, title } = req.body;

  if (!isValidId(courseId)) {
    return res.status(400).json({ message: "A valid courseId is required" });
  }

  try {
    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const lastNotebook = await Notebook.findOne({ courseId }).sort({ position: -1 });
    const position = lastNotebook ? lastNotebook.position + 1 : 0;
    const notebook = await Notebook.create({
      courseId,
      title,
      position,
      cells: [{ type: "markdown", content: "", position: 0 }],
    });

    res.status(201).json(notebook);
  } catch (error) {
    console.error("Error in createNotebook controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateNotebook(req, res) {
  try {
    const notebook = await Notebook.findByIdAndUpdate(
      req.params.id,
      { title: req.body.title },
      { new: true, runValidators: true }
    );

    if (!notebook) {
      return res.status(404).json({ message: "Notebook not found" });
    }

    res.status(200).json(notebook);
  } catch (error) {
    console.error("Error in updateNotebook controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function saveNotebookCells(req, res) {
  const { cells } = req.body;

  if (!Array.isArray(cells)) {
    return res.status(400).json({ message: "cells must be an array" });
  }

  const normalizedCells = [];

  for (let position = 0; position < cells.length; position += 1) {
    const cell = cells[position];

    if (!cell || !["markdown", "code"].includes(cell.type)) {
      return res.status(400).json({ message: `Cell ${position + 1} has an invalid type` });
    }

    const { testCases, error } = cell.type === "code"
      ? getValidatedTestCases(cell.testCases)
      : { testCases: [] };

    if (error) {
      return res.status(400).json({ message: error });
    }

    normalizedCells.push({
      _id: cell._id,
      type: cell.type,
      content: cell.content ?? "",
      language: cell.type === "code" ? cell.language || "plaintext" : "plaintext",
      position,
      testCases,
    });
  }

  try {
    const notebook = await Notebook.findById(req.params.id);

    if (!notebook) {
      return res.status(404).json({ message: "Notebook not found" });
    }

    notebook.cells = normalizedCells;

    const savedNotebook = await notebook.save();
    res.status(200).json(savedNotebook);
  } catch (error) {
    console.error("Error in saveNotebookCells controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function runNotebookCell(req, res) {
  if (!isValidId(req.params.id) || !isValidId(req.params.cellId)) {
    return res.status(400).json({ message: "A valid notebook and code cell are required" });
  }

  try {
    const notebook = await Notebook.findById(req.params.id);

    if (!notebook) {
      return res.status(404).json({ message: "Notebook not found" });
    }

    const cell = notebook.cells.id(req.params.cellId);

    if (!cell || cell.type !== "code") {
      return res.status(404).json({ message: "Code cell not found" });
    }

    if (!EXECUTABLE_LANGUAGES.has(cell.language)) {
      return res.status(400).json({
        message: "Only JavaScript and Python code cells can run right now",
      });
    }

    const source = req.body.source ?? cell.content;
    const stdin = req.body.stdin ?? "";

    if (typeof source !== "string" || source.length > MAX_SOURCE_LENGTH) {
      return res.status(400).json({ message: "Code must be text and 64 KiB or smaller" });
    }

    if (typeof stdin !== "string" || stdin.length > MAX_STANDARD_INPUT_LENGTH) {
      return res.status(400).json({ message: "Standard input must be text and 8 KiB or smaller" });
    }

    const result = await executeInRunner({
      language: cell.language,
      source,
      stdin,
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof RunnerConfigurationError) {
      return res.status(503).json({ message: "Code execution has not been configured yet" });
    }

    if (error instanceof RunnerUnavailableError) {
      return res.status(503).json({ message: "Code execution is temporarily unavailable" });
    }

    if (error instanceof RunnerResponseError) {
      return res.status(502).json({ message: "The code runner could not execute this request" });
    }

    console.error("Error running notebook code cell", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function runNotebookCellTests(req, res) {
  if (!isValidId(req.params.id) || !isValidId(req.params.cellId)) {
    return res.status(400).json({ message: "A valid notebook and code cell are required" });
  }

  try {
    const notebook = await Notebook.findById(req.params.id);

    if (!notebook) {
      return res.status(404).json({ message: "Notebook not found" });
    }

    const cell = notebook.cells.id(req.params.cellId);

    if (!cell || cell.type !== "code") {
      return res.status(404).json({ message: "Code cell not found" });
    }

    if (!EXECUTABLE_LANGUAGES.has(cell.language)) {
      return res.status(400).json({
        message: "Only JavaScript and Python code cells can run right now",
      });
    }

    if (!cell.testCases.length) {
      return res.status(400).json({ message: "Add and save at least one visible test case first" });
    }

    const source = req.body.source ?? cell.content;

    if (typeof source !== "string" || source.length > MAX_SOURCE_LENGTH) {
      return res.status(400).json({ message: "Code must be text and 64 KiB or smaller" });
    }

    const deadline = Date.now() + MAX_TEST_SUITE_DURATION_MS;
    const results = [];
    let passed = 0;

    for (const testCase of cell.testCases) {
      const remainingTime = deadline - Date.now();

      if (remainingTime <= 0) {
        results.push({
          id: testCase.id,
          passed: false,
          actualOutput: "",
          status: "TO",
          message: "The test suite reached its 15-second time limit",
        });
        continue;
      }

      const execution = await executeTestInRunner({
        language: cell.language,
        source,
        stdin: testCase.input,
        requestTimeoutMs: remainingTime,
      });
      const run = execution.run;
      const actualOutput = run?.stdout || "";
      const ranSuccessfully = run && !run.status && run.code === 0;
      const testPassed =
        ranSuccessfully && normalizeOutput(actualOutput) === normalizeOutput(testCase.expectedOutput);

      if (testPassed) {
        passed += 1;
      }

      results.push({
        id: testCase.id,
        passed: testPassed,
        actualOutput,
        status: run?.status || null,
        message: run?.message || run?.stderr || null,
      });
    }

    res.status(200).json({
      summary: { passed, total: cell.testCases.length },
      results,
    });
  } catch (error) {
    if (error instanceof RunnerConfigurationError) {
      return res.status(503).json({ message: "Code execution has not been configured yet" });
    }

    if (error instanceof RunnerUnavailableError) {
      return res.status(503).json({ message: "Code execution is temporarily unavailable" });
    }

    if (error instanceof RunnerResponseError) {
      return res.status(502).json({ message: "The code runner could not execute this request" });
    }

    console.error("Error running notebook code cell tests", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function reorderNotebooks(req, res) {
  const { courseId, notebookIds } = req.body;

  if (!isValidId(courseId) || !Array.isArray(notebookIds)) {
    return res.status(400).json({ message: "courseId and notebookIds are required" });
  }

  try {
    const notebooks = await Notebook.find({ courseId, _id: { $in: notebookIds } });

    if (notebooks.length !== notebookIds.length) {
      return res.status(400).json({ message: "Every notebook must belong to this course" });
    }

    await Notebook.bulkWrite(
      notebookIds.map((id, position) => ({
        updateOne: { filter: { _id: id }, update: { position } },
      }))
    );

    const reorderedNotebooks = await Notebook.find({ courseId }).sort({ position: 1 });
    res.status(200).json(reorderedNotebooks);
  } catch (error) {
    console.error("Error in reorderNotebooks controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteNotebook(req, res) {
  try {
    const notebook = await Notebook.findByIdAndDelete(req.params.id);

    if (!notebook) {
      return res.status(404).json({ message: "Notebook not found" });
    }

    res.status(200).json({ message: "Notebook deleted successfully" });
  } catch (error) {
    console.error("Error in deleteNotebook controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

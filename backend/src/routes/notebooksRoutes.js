import express from "express";
import {
  createNotebook,
  deleteNotebook,
  getNotebookById,
  getNotebooksByCourse,
  reorderNotebooks,
  runNotebookCell,
  runNotebookCellTests,
  saveNotebookCells,
  updateNotebook,
} from "../controllers/notebooksController.js";
import executionRateLimiter from "../middleware/executionRateLimiter.js";

const router = express.Router();

router.get("/", getNotebooksByCourse);
router.post("/", createNotebook);
router.patch("/reorder", reorderNotebooks);
router.get("/:id", getNotebookById);
router.put("/:id", updateNotebook);
router.put("/:id/cells", saveNotebookCells);
router.post("/:id/cells/:cellId/run", executionRateLimiter, runNotebookCell);
router.post("/:id/cells/:cellId/run-tests", executionRateLimiter, runNotebookCellTests);
router.delete("/:id", deleteNotebook);

export default router;

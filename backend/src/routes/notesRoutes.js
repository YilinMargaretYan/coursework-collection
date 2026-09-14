import express from "express";
import { createNotes, deleteNotes, getNoteById, getAllNotes, updateNotes } from "../controllers/notesController.js";

const router = express.Router();

router.get("/", getAllNotes);
router.post("/", createNotes);
router.get("/:id", getNoteById);
router.put("/:id", updateNotes);
router.delete("/:id", deleteNotes);

export default router;
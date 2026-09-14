import express from "express";
import { createStudyResponse } from "../controllers/studyController.js";
import studyRateLimiter from "../middleware/studyRateLimiter.js";

const router = express.Router();

router.post("/", studyRateLimiter, createStudyResponse);

export default router;

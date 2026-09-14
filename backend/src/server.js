import express from "express";
import coursesRoutes from "./routes/coursesRoutes.js";
import notebooksRoutes from "./routes/notebooksRoutes.js";
import notesRoutes from "./routes/notesRoutes.js";
import studyRoutes from "./routes/studyRoutes.js";
import { connectDB } from "./config/db.js";
import rateLimiter from "./middleware/rateLimiter.js";
import dotenv from "dotenv";

import cors from "cors";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// middleware
app.use(rateLimiter);
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
app.use("/api/courses", coursesRoutes);
app.use("/api/notebooks", notebooksRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/study", studyRoutes);


connectDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server started on PORT:", PORT);
  });
});




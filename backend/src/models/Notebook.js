import mongoose from "mongoose";

const testCaseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  input: {
    type: String,
    default: "",
    maxlength: 8 * 1024,
  },
  expectedOutput: {
    type: String,
    default: "",
    maxlength: 8 * 1024,
  },
});

const cellSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["markdown", "code"],
    required: true,
  },
  content: {
    type: String,
    default: "",
  },
  language: {
    type: String,
    default: "plaintext",
  },
  position: {
    type: Number,
    required: true,
    min: 0,
  },
  testCases: {
    type: [testCaseSchema],
    default: [],
    validate: {
      validator: (testCases) => testCases.length <= 15,
      message: "A code cell can have at most 15 visible test cases",
    },
  },
});

const notebookSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: Number,
      required: true,
      min: 0,
    },
    cells: {
      type: [cellSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const Notebook = mongoose.model("Notebook", notebookSchema);

export default Notebook;

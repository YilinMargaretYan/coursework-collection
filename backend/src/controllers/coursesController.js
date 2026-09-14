import Course from "../models/Course.js";
import Notebook from "../models/Notebook.js";

export async function getAllCourses(_, res) {
  try {
    const courses = await Course.find().sort({ updatedAt: -1 });
    res.status(200).json(courses);
  } catch (error) {
    console.error("Error in getAllCourses controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getCourseById(req, res) {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.status(200).json(course);
  } catch (error) {
    console.error("Error in getCourseById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createCourse(req, res) {
  try {
    const { title, description } = req.body;
    const course = await Course.create({ title, description });

    res.status(201).json(course);
  } catch (error) {
    console.error("Error in createCourse controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateCourse(req, res) {
  try {
    const { title, description } = req.body;
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { title, description },
      { new: true, runValidators: true }
    );

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.status(200).json(course);
  } catch (error) {
    console.error("Error in updateCourse controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteCourse(req, res) {
  try {
    const notebookCount = await Notebook.countDocuments({ courseId: req.params.id });

    if (notebookCount > 0) {
      return res.status(409).json({
        message: "Delete this course's notebooks before deleting the course",
      });
    }

    const course = await Course.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.status(200).json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error in deleteCourse controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

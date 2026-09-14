import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router";
import Navbar from "../components/Navbar.jsx";
import api from "../lib/axios.js";

const CoursesPage = () => {
  const [courses, setCourses] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await api.get("/courses");
        setCourses(response.data);
      } catch (error) {
        console.error("Error fetching courses", error);
        toast.error("Failed to load courses");
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("A course title is required");
      return;
    }

    setSaving(true);

    try {
      const response = await api.post("/courses", { title, description });
      setCourses((currentCourses) => [response.data, ...currentCourses]);
      setTitle("");
      setDescription("");
      toast.success("Course created");
    } catch (error) {
      console.error("Error creating course", error);
      toast.error("Failed to create course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200">
      <Navbar />

      <main className="mx-auto max-w-5xl p-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold">Courses</h2>
          <p className="mt-2 text-base-content/70">
            Create a course first. We will add its notebooks in the next step.
          </p>
        </div>

        <section className="card mb-8 bg-base-100 shadow-sm">
          <div className="card-body">
            <h3 className="card-title">Create a course</h3>
            <form className="mt-2 space-y-4" onSubmit={handleSubmit}>
              <input
                className="input input-bordered w-full"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="For example, Web Development 101"
                value={title}
              />
              <textarea
                className="textarea textarea-bordered min-h-24 w-full"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A short description (optional)"
                value={description}
              />
              <div className="card-actions justify-end">
                <button className="btn btn-primary" disabled={saving} type="submit">
                  {saving ? "Creating..." : "Create Course"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {loading && <p className="text-primary">Loading courses...</p>}

        {!loading && courses.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-base-content/70">
            No courses yet. Create one above to start your course notebook.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <article className="card bg-base-100 shadow-sm" key={course._id}>
              <div className="card-body">
                <h3 className="card-title">{course.title}</h3>
                {course.description && <p>{course.description}</p>}
                <div className="card-actions justify-end">
                  <Link className="btn btn-primary btn-sm" to={`/course/${course._id}`}>
                    Open Course
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
};

export default CoursesPage;

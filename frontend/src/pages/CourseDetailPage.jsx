import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router";
import Navbar from "../components/Navbar.jsx";
import api from "../lib/axios.js";

const CourseDetailPage = () => {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [notebooks, setNotebooks] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCourse = useCallback(async () => {
    const [courseResponse, notebooksResponse] = await Promise.all([
      api.get(`/courses/${id}`),
      api.get(`/notebooks?courseId=${id}`),
    ]);

    setCourse(courseResponse.data);
    setNotebooks(notebooksResponse.data);
  }, [id]);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        await loadCourse();
      } catch (error) {
        console.error("Error loading course", error);
        toast.error("Failed to load this course");
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [loadCourse]);

  const createNotebook = async (event) => {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("A notebook title is required");
      return;
    }

    setSaving(true);

    try {
      const response = await api.post("/notebooks", { courseId: id, title });
      setNotebooks((currentNotebooks) => [...currentNotebooks, response.data]);
      setTitle("");
      toast.success("Notebook created");
    } catch (error) {
      console.error("Error creating notebook", error);
      toast.error("Failed to create notebook");
    } finally {
      setSaving(false);
    }
  };

  const moveNotebook = async (index, direction) => {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= notebooks.length) {
      return;
    }

    const reorderedNotebooks = [...notebooks];
    [reorderedNotebooks[index], reorderedNotebooks[nextIndex]] = [
      reorderedNotebooks[nextIndex],
      reorderedNotebooks[index],
    ];
    setNotebooks(reorderedNotebooks);

    try {
      const response = await api.patch("/notebooks/reorder", {
        courseId: id,
        notebookIds: reorderedNotebooks.map((notebook) => notebook._id),
      });
      setNotebooks(response.data);
    } catch (error) {
      console.error("Error reordering notebooks", error);
      toast.error("Failed to save notebook order");
      await loadCourse();
    }
  };

  if (loading) {
    return <div className="p-8 text-primary">Loading course...</div>;
  }

  if (!course) {
    return <div className="p-8">Course not found.</div>;
  }

  return (
    <div className="min-h-screen bg-base-200">
      <Navbar />

      <main className="mx-auto max-w-5xl p-4 py-8">
        <Link className="btn btn-ghost mb-6" to="/courses">
          Back to Courses
        </Link>

        <h2 className="text-3xl font-bold">{course.title}</h2>
        {course.description && <p className="mt-2 text-base-content/70">{course.description}</p>}

        <section className="card my-8 bg-base-100 shadow-sm">
          <div className="card-body">
            <h3 className="card-title">Create a notebook</h3>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createNotebook}>
              <input
                className="input input-bordered flex-1"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="For example, Week 1 notes"
                value={title}
              />
              <button className="btn btn-primary" disabled={saving} type="submit">
                {saving ? "Creating..." : "Create Notebook"}
              </button>
            </form>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-xl font-semibold">Notebooks</h3>

          {notebooks.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-base-content/70">
              This course has no notebooks yet.
            </p>
          )}

          <div className="space-y-3">
            {notebooks.map((notebook, index) => (
              <article
                className="flex items-center gap-3 rounded-lg bg-base-100 p-4 shadow-sm"
                key={notebook._id}
              >
                <div className="flex flex-col">
                  <button
                    aria-label={`Move ${notebook.title} up`}
                    className="btn btn-ghost btn-xs"
                    disabled={index === 0}
                    onClick={() => moveNotebook(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${notebook.title} down`}
                    className="btn btn-ghost btn-xs"
                    disabled={index === notebooks.length - 1}
                    onClick={() => moveNotebook(index, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                </div>
                <Link className="flex-1 font-medium hover:text-primary" to={`/notebook/${notebook._id}`}>
                  {notebook.title}
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default CourseDetailPage;

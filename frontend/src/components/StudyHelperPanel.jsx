import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import api from "../lib/axios.js";

const actions = [
  { id: "explain", label: "Explain selected code", requiresCode: true },
  { id: "hint", label: "Give me a hint", requiresCode: true },
  { id: "summary", label: "Summarize notes", requiresNotes: true },
  { id: "questions", label: "Create practice questions", requiresNotes: true },
];

const StudyHelperPanel = ({ cells, selectedCell }) => {
  const [responseText, setResponseText] = useState("");
  const [loadingAction, setLoadingAction] = useState(null);

  const notes = useMemo(
    () =>
      cells
        .filter((cell) => cell.type === "markdown" && cell.content.trim())
        .map((cell) => cell.content.trim())
        .join("\n\n"),
    [cells]
  );

  const askStudyHelper = async (action) => {
    const currentAction = actions.find((item) => item.id === action);

    if (currentAction.requiresCode && (!selectedCell || selectedCell.type !== "code" || !selectedCell.content.trim())) {
      toast.error("Choose a non-empty code cell first");
      return;
    }

    if (currentAction.requiresNotes && !notes) {
      toast.error("Add Markdown notes first");
      return;
    }

    setLoadingAction(action);
    setResponseText("");

    try {
      const result = await api.post("/study", {
        action,
        selectedCell: selectedCell
          ? {
              type: selectedCell.type,
              content: selectedCell.content,
              language: selectedCell.language,
            }
          : null,
        notes,
      });
      setResponseText(result.data.text);
    } catch (error) {
      const message = error.response?.data?.message || "The study helper could not answer right now";
      toast.error(message);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <aside className="card order-first h-fit bg-base-100 shadow-sm lg:order-last lg:sticky lg:top-4">
      <div className="card-body gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">AI Study Helper</p>
          <h2 className="card-title">Learn from your notebook</h2>
        </div>

        <div className="rounded-lg bg-base-200 p-3 text-sm">
          {selectedCell ? (
            <p>
              Using <strong>{selectedCell.type === "code" ? "the selected code cell" : "a Markdown cell"}</strong> for code help.
            </p>
          ) : (
            <p>Select a code cell to explain it or get a hint.</p>
          )}
        </div>

        <div className="grid gap-2">
          {actions.map((action) => (
            <button
              className="btn btn-outline btn-sm justify-start"
              disabled={Boolean(loadingAction)}
              key={action.id}
              onClick={() => askStudyHelper(action.id)}
              type="button"
            >
              {loadingAction === action.id ? "Thinking..." : action.label}
            </button>
          ))}
        </div>

        {responseText && (
          <div className="rounded-lg border border-base-300 p-3">
            <p className="mb-2 text-sm font-semibold">Study response</p>
            <p className="whitespace-pre-wrap text-sm leading-6">{responseText}</p>
          </div>
        )}

        <p className="text-xs leading-5 text-base-content/60">
          Only the material needed for this request is sent to the AI. Do not include passwords, API keys, or private information. AI can make mistakes, so use it as study support.
        </p>
      </div>
    </aside>
  );
};

export default StudyHelperPanel;

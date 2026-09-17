import { useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import type { CardInput } from "@/lib/api";

type NewCardFormProps = {
  onAdd: (input: CardInput) => Promise<void>;
  onClose: () => void;
};

export const NewCardForm = ({ onAdd, onClose }: NewCardFormProps) => {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onAdd({
        title: title.trim(),
        details: details.trim(),
        priority: "none",
        dueDate: null,
        labelIds: [],
      });
      onClose();
    } catch {
      // failure is surfaced by the parent; keep the form open so input isn't lost
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      className="space-y-2 rounded-2xl border border-[var(--primary-blue)] bg-white p-3 shadow-[0_6px_16px_rgba(3,33,71,0.06)]"
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Card title"
        maxLength={200}
        autoFocus
        required
        className="w-full bg-transparent text-sm font-semibold text-[var(--navy-dark)] outline-none placeholder:font-normal"
      />
      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Details"
        rows={2}
        className="w-full resize-none bg-transparent text-xs leading-5 text-[var(--gray-text)] outline-none"
      />
      <div className="flex justify-end gap-1">
        <IconButton label="Cancel" icon={X} onClick={onClose} />
        <IconButton
          label="Add card"
          icon={Check}
          type="submit"
          variant="primary"
          disabled={isSubmitting}
        />
      </div>
    </form>
  );
};

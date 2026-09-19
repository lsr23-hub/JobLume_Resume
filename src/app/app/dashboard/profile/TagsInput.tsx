import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** 第一个标签是「类别」，在列表上作为展示标签 —— 界面需说明它与其他标签不同 */
  firstIsCategory?: boolean;
}

export const TagsInput = ({
  value,
  onChange,
  placeholder,
  firstIsCategory = false,
}: TagsInputProps) => {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim();
    if (!tag || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "，") {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, index) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
              firstIsCategory && index === 0
                ? "bg-primary/15 font-medium text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="opacity-60 transition-opacity hover:opacity-100"
              aria-label={`移除 ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={placeholder}
      />
    </div>
  );
};

import { Form, InputGroup } from "react-bootstrap";
import { IoSearch } from "react-icons/io5";

interface FilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function FilterBar({
  value,
  onChange,
  placeholder = "Search...",
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <InputGroup>
        <InputGroup.Text className="filter-icon">
          <IoSearch size={20} />
        </InputGroup.Text>
        <Form.Control
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </InputGroup>

      <style>{`
        .filter-bar {
          margin-bottom: var(--space-md);
        }
        .filter-bar .input-group-text.filter-icon {
          background: var(--color-surface);
          border: none;
          border-bottom: 2px solid var(--color-accent);
          border-radius: var(--radius-sm) 0 0 var(--radius-sm);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}

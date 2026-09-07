"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ApiError, getJson } from "@/lib/api-client";

export interface UserOption {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Shared user search-and-select, used wherever an admin form needs to pick
 * a single user by name or email (department manager, group member) rather
 * than type a raw id — UI_UX_SPEC.md §6 doesn't mandate a specific widget
 * here, so this is the one simple building block both sections reuse.
 */
export function UserPicker({
  onSelect,
  placeholder = "Search by name or email…",
}: {
  onSelect: (user: UserOption) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const data = await getJson<UserOption[]>(
        `/api/v1/users?q=${encodeURIComponent(query.trim())}&pageSize=8`,
      );
      setResults(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't search users.",
      );
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={placeholder}
          aria-label="Search users"
        />
        <Button
          type="button"
          variant="outline"
          onClick={search}
          disabled={searching}
        >
          Search
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {results &&
        (results.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matching users.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="hover:bg-muted flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                  onClick={() => {
                    onSelect(u);
                    setResults(null);
                    setQuery("");
                  }}
                >
                  <span>{u.displayName}</span>
                  <span className="text-muted-foreground truncate">
                    {u.email}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

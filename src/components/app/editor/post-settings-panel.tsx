import type { Priority } from "@/generated/prisma/client";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { RoutePreview } from "@/modules/posts";

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export interface PostSettingsPanelProps {
  priority: Priority;
  onPriorityChange: (priority: Priority) => void;
  departmentId: string | null;
  onDepartmentChange: (departmentId: string) => void;
  departments: { id: string; name: string }[];
  changeSummary: string;
  onChangeSummaryChange: (value: string) => void;
  onChangeSummaryBlur?: () => void;
  routePreview: RoutePreview | null;
  disabled?: boolean;
}

/** UI_UX_SPEC.md §4's POST SETTINGS panel. */
export function PostSettingsPanel({
  priority,
  onPriorityChange,
  departmentId,
  onDepartmentChange,
  departments,
  changeSummary,
  onChangeSummaryChange,
  onChangeSummaryBlur,
  routePreview,
  disabled,
}: PostSettingsPanelProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Post settings</h2>

      <div className="space-y-1.5">
        <Label htmlFor="post-priority">Priority</Label>
        <Select
          value={priority}
          onValueChange={(v) => onPriorityChange(v as Priority)}
          disabled={disabled}
        >
          <SelectTrigger id="post-priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="post-department">Department</Label>
        <Select
          value={departmentId ?? undefined}
          onValueChange={onDepartmentChange}
          disabled={disabled}
        >
          <SelectTrigger
            id="post-department"
            aria-invalid={departmentId === null}
          >
            <SelectValue placeholder="Select a department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label id="approval-route-label">Approval route</Label>
        <RadioGroup value="automatic" aria-labelledby="approval-route-label">
          <div className="flex items-start gap-2">
            <RadioGroupItem value="automatic" id="route-automatic" disabled />
            <div>
              <Label htmlFor="route-automatic" className="font-normal">
                Automatic (rule)
              </Label>
              <p className="text-muted-foreground text-sm">
                {routePreview
                  ? routePreview.assigneeName
                  : "No route resolves yet — pick a department."}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem value="manual" id="route-manual" disabled />
            <div>
              <Label
                htmlFor="route-manual"
                className="text-muted-foreground font-normal"
              >
                Choose approver
              </Label>
              <p className="text-muted-foreground text-xs">
                Arrives with approval assignment (Phase 12).
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="change-summary">Change summary</Label>
        <Textarea
          id="change-summary"
          placeholder="What changed…"
          value={changeSummary}
          onChange={(e) => onChangeSummaryChange(e.target.value)}
          onBlur={onChangeSummaryBlur}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

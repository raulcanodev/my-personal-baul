"use client";

// React port of Paqui's TableToolbar: search, a "Filtros" menu with one panel per field, and
// removable chips for the active filters.
import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DATE_PRESET_LABELS,
  clearRemovableFilters,
  formatDateRange,
  getActiveFilter,
  isDateRangeValue,
  resolveDatePreset,
  setActiveFilterValue,
  type ActiveFilter,
  type DateRangePreset,
  type DateRangeValue,
  type FilterField,
  type FilterValue,
} from "./table-filters";

const defaultDatePresets: DateRangePreset[] = [
  "today",
  "this_week",
  "this_month",
  "last_month",
  "last_30",
];

type OptionsField = Extract<FilterField, { type: "select" | "multi-select" }>;
type DateField = Extract<FilterField, { type: "date-range" }>;

function FilterOptionList({
  field,
  value,
  onChange,
}: {
  field: OptionsField;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
}) {
  const [term, setTerm] = useState("");
  const selected = Array.isArray(value) ? value : [];
  const visibleOptions = useMemo(() => {
    const needle = term.trim().toLocaleLowerCase();
    if (!needle) return field.options;
    return field.options.filter((option) =>
      `${option.label} ${option.description ?? ""} ${option.keywords ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [field.options, term]);
  const toggle = (item: string) => {
    if (field.type === "select") {
      onChange(selected[0] === item ? undefined : [item]);
      return;
    }
    onChange(
      selected.includes(item)
        ? selected.filter((v) => v !== item)
        : [...selected, item],
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {(field.searchable ?? field.options.length > 6) && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.currentTarget.value)}
            placeholder="Buscar…"
            className="h-8 pl-8"
          />
        </div>
      )}
      <div className="-mx-1 flex max-h-72 flex-col overflow-y-auto px-1">
        {visibleOptions.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">
            Sin resultados
          </p>
        ) : (
          visibleOptions.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className="hover:bg-muted flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                onClick={() => toggle(option.value)}
              >
                {field.type === "multi-select" && (
                  <span
                    className={cn(
                      "border-primary flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      isSelected && "bg-primary text-primary-foreground",
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </span>
                )}
                {option.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {option.description}
                    </span>
                  )}
                </span>
                {field.type === "select" && isSelected && (
                  <Check className="size-4" />
                )}
              </button>
            );
          })
        )}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground border-t px-2 pt-2 text-left text-xs font-medium"
          onClick={() => onChange(undefined)}
        >
          Quitar filtro
        </button>
      )}
    </div>
  );
}

function DateRangeEditor({
  field,
  value,
  onChange,
}: {
  field: DateField;
  value: FilterValue | undefined;
  onChange: (value: DateRangeValue | undefined) => void;
}) {
  const range = isDateRangeValue(value) ? value : undefined;
  return (
    <div className="flex flex-col gap-1">
      {(field.presets ?? defaultDatePresets).map((preset) => (
        <button
          key={preset}
          type="button"
          className="hover:bg-muted flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors"
          onClick={() => onChange(resolveDatePreset(preset))}
        >
          <span className="flex-1">{DATE_PRESET_LABELS[preset]}</span>
          {range?.preset === preset && <Check className="size-4" />}
        </button>
      ))}
      <div className="bg-border my-1 h-px" />
      <p className="text-muted-foreground px-2 text-xs font-medium">
        Rango personalizado
      </p>
      <div className="grid grid-cols-2 gap-2 px-2 pb-1">
        <Input
          type="date"
          value={range?.from ?? ""}
          onChange={(e) =>
            onChange(
              e.currentTarget.value
                ? {
                    from: e.currentTarget.value,
                    to: range?.to ?? e.currentTarget.value,
                  }
                : undefined,
            )
          }
          className="h-8 min-w-0 px-2 text-xs"
        />
        <Input
          type="date"
          value={range?.to ?? ""}
          onChange={(e) =>
            onChange(
              e.currentTarget.value
                ? {
                    from: range?.from ?? e.currentTarget.value,
                    to: e.currentTarget.value,
                  }
                : undefined,
            )
          }
          className="h-8 min-w-0 px-2 text-xs"
        />
      </div>
    </div>
  );
}

function TableFilterMenu({
  fields,
  value,
  onChange,
}: {
  fields: FilterField[];
  value: ActiveFilter[];
  onChange: (value: ActiveFilter[]) => void;
}) {
  const [activeFieldId, setActiveFieldId] = useState<string>();
  const activeField =
    fields.length === 1
      ? fields[0]
      : fields.find((field) => field.id === activeFieldId);
  const removableCount = value.filter(
    (filter) => !fields.find((field) => field.id === filter.fieldId)?.required,
  ).length;
  const update = (fieldId: string, next: FilterValue | undefined) =>
    onChange(setActiveFilterValue(value, fieldId, next));

  return (
    <Popover onOpenChange={(open) => !open && setActiveFieldId(undefined)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5",
            removableCount > 0 && "border-foreground/30",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {removableCount > 0 && (
            <span className="bg-primary text-primary-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
              {removableCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(16rem,calc(100vw-2rem))] p-1.5"
      >
        {activeField ? (
          <div className="flex flex-col gap-1.5">
            {fields.length > 1 && (
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium"
                onClick={() => setActiveFieldId(undefined)}
              >
                <ChevronLeft className="size-3.5" />
                {activeField.label}
              </button>
            )}
            {activeField.type === "date-range" ? (
              <DateRangeEditor
                field={activeField}
                value={getActiveFilter(value, activeField.id)?.value}
                onChange={(next) => update(activeField.id, next)}
              />
            ) : (
              <FilterOptionList
                field={activeField}
                value={getActiveFilter(value, activeField.id)?.value}
                onChange={(next) => update(activeField.id, next)}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {fields.map((field) => {
              const Icon = field.icon;
              return (
                <button
                  key={field.id}
                  type="button"
                  className="hover:bg-muted flex min-h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors"
                  onClick={() => setActiveFieldId(field.id)}
                >
                  {Icon && <Icon className="text-muted-foreground size-4" />}
                  <span className="flex-1">{field.label}</span>
                  <ChevronRight className="text-muted-foreground size-4" />
                </button>
              );
            })}
            {removableCount > 0 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mt-1 border-t px-2 pt-2 text-left text-xs font-medium"
                onClick={() => onChange(clearRemovableFilters(value, fields))}
              >
                Quitar todos
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export type TableToolbarProps = {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchLoading?: boolean;
  fields?: FilterField[];
  filters?: ActiveFilter[];
  onFiltersChange?: (value: ActiveFilter[]) => void;
  actions?: ReactNode;
  className?: string;
};

function describe(field: FilterField, value: FilterValue) {
  if (isDateRangeValue(value)) {
    return value.preset
      ? DATE_PRESET_LABELS[value.preset]
      : formatDateRange(value, "es-ES");
  }
  const values = Array.isArray(value) ? value : [value];
  const names = values.map((item) =>
    field.type === "date-range"
      ? item
      : (field.options.find((option) => option.value === item)?.label ?? item),
  );
  return names.length > 2
    ? `${names[0]} +${names.length - 1}`
    : names.join(", ");
}

export function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  searchLoading,
  fields = [],
  filters = [],
  onFiltersChange,
  actions,
  className,
}: TableToolbarProps) {
  return (
    <div className={cn("mb-4 flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange && (
          <div className="relative w-full min-w-0 sm:w-64">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.currentTarget.value)}
              placeholder={searchPlaceholder}
              className="h-9 pr-9 pl-9"
            />
            {searchLoading && (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
            )}
          </div>
        )}
        {fields.length > 0 && onFiltersChange && (
          <TableFilterMenu
            fields={fields}
            value={filters}
            onChange={onFiltersChange}
          />
        )}
        {actions}
      </div>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const field = fields.find((item) => item.id === filter.fieldId);
            if (!field) return null;
            const Icon = field.icon;
            return (
              <span
                key={filter.fieldId}
                className="bg-background inline-flex h-8 max-w-full items-center overflow-hidden rounded-full border text-xs shadow-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5 pr-2 pl-2.5">
                  {Icon && <Icon className="text-muted-foreground size-3.5" />}
                  <span className="text-muted-foreground">{field.label}</span>
                  <span className="max-w-48 truncate font-medium">
                    {describe(field, filter.value)}
                  </span>
                </span>
                {!field.required && (
                  <button
                    type="button"
                    aria-label="Quitar filtro"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center border-l"
                    onClick={() =>
                      onFiltersChange?.(
                        filters.filter((v) => v.fieldId !== filter.fieldId),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

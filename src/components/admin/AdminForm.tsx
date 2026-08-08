'use client';

/**
 * The one form component every entity's create and edit page uses (PR-19
 * acceptance criteria). A field-schema config renders the whole form, so
 * adding an entity means writing a field list, not a new component.
 *
 * **Client component, justified in one line:** `useActionState` keeps
 * submitted values on the DOM and shows field errors inline when validation
 * fails; the alternative — throwing to the nearest `error.tsx` — would
 * discard everything the user typed on every mistake. This is the only
 * client component PR-19 adds, and every admin form reuses this one instance
 * of it rather than each shipping its own.
 */

import { useActionState } from 'react';

import { Button, Checkbox, Input, Select, Textarea } from '@/components/ui';

export interface SelectFieldOption {
  value: string;
  label: string;
}

export type FieldDef =
  | {
      type: 'text' | 'email' | 'url';
      name: string;
      label: string;
      required?: boolean;
      maxLength?: number;
    }
  | { type: 'number'; name: string; label: string; required?: boolean; min?: number; max?: number }
  | { type: 'textarea'; name: string; label: string; rows?: number }
  | {
      type: 'select';
      name: string;
      label: string;
      options: SelectFieldOption[];
      required?: boolean;
      /** Shown as the empty option. Leave unselected by default — never a fabricated default (CLAUDE.md rule 1). */
      placeholder?: string;
    }
  | { type: 'checkbox'; name: string; label: string }
  | { type: 'file'; name: string; label: string; accept?: string; hint?: string };

export interface AdminFormState {
  errors?: Record<string, string>;
  formError?: string;
}

export type AdminFormAction = (
  prevState: AdminFormState,
  formData: FormData,
) => Promise<AdminFormState>;

export interface AdminFormProps {
  fields: FieldDef[];
  /**
   * Prefill values, typically an entity row spread directly — which is why
   * this accepts `unknown`: a row carries `Date`s and enum unions this form
   * never renders (`createdAt`, `matchKey`…). Only keys matching a field's
   * `name` are ever read.
   */
  defaultValues?: Record<string, unknown>;
  action: AdminFormAction;
  submitLabel: string;
  cancelHref: string;
}

function stringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function renderField(
  field: FieldDef,
  defaultValues: NonNullable<AdminFormProps['defaultValues']>,
  errors: Record<string, string> | undefined,
) {
  const error = errors?.[field.name];
  const errorId = error ? `${field.name}-error` : undefined;

  const wrapper = (node: React.ReactNode) => (
    <div key={field.name} className="flex flex-col gap-1.5">
      {node}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );

  if (field.type === 'checkbox') {
    return wrapper(
      <Checkbox
        id={field.name}
        name={field.name}
        label={field.label}
        defaultChecked={Boolean(defaultValues[field.name])}
        aria-describedby={errorId}
      />,
    );
  }

  if (field.type === 'select') {
    return wrapper(
      <Select
        id={field.name}
        name={field.name}
        label={field.label}
        required={field.required}
        defaultValue={stringValue(defaultValues[field.name])}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
      >
        <option value="">{field.placeholder ?? 'Seleccioná…'}</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>,
    );
  }

  if (field.type === 'textarea') {
    return wrapper(
      <Textarea
        id={field.name}
        name={field.name}
        label={field.label}
        rows={field.rows}
        defaultValue={stringValue(defaultValues[field.name])}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
      />,
    );
  }

  if (field.type === 'file') {
    return wrapper(
      <div className="flex flex-col gap-1.5 text-sm text-body">
        <label htmlFor={field.name}>{field.label}</label>
        <input
          id={field.name}
          name={field.name}
          type="file"
          accept={field.accept}
          className="text-sm text-body file:mr-3 file:min-h-10 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
          aria-describedby={errorId}
        />
        {field.hint && <p className="text-xs text-faint">{field.hint}</p>}
      </div>,
    );
  }

  return wrapper(
    <Input
      id={field.name}
      name={field.name}
      label={field.label}
      type={field.type === 'number' ? 'number' : field.type}
      required={field.required}
      maxLength={field.type !== 'number' ? field.maxLength : undefined}
      min={field.type === 'number' ? field.min : undefined}
      max={field.type === 'number' ? field.max : undefined}
      defaultValue={stringValue(defaultValues[field.name])}
      aria-invalid={Boolean(error)}
      aria-describedby={errorId}
    />,
  );
}

export function AdminForm({
  fields,
  defaultValues = {},
  action,
  submitLabel,
  cancelHref,
}: AdminFormProps) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, {});
  const hasFile = fields.some((f) => f.type === 'file');

  return (
    <form
      action={formAction}
      encType={hasFile ? 'multipart/form-data' : undefined}
      className="flex flex-col gap-5"
    >
      {state.formError && (
        <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.formError}
        </p>
      )}
      {fields.map((field) => renderField(field, defaultValues, state.errors))}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
        <Button variant="secondary" href={cancelHref}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

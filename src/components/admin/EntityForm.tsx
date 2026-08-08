'use client';

/**
 * Client component justification (CLAUDE.md rule 6): `useActionState` is what
 * renders a per-field validation message beside the field the operator typed
 * in, without losing the rest of a twelve-field form to a navigation, and
 * `useFormStatus` disables the submit while the save (plus its activity-log
 * write) is in flight. No rule lives here — the action parses, validates and
 * authorizes; this renders what it returns.
 *
 * One form component serves create *and* edit, which is what `pr-plan.md` asks
 * for: the only difference is whether `defaults` is a row or empty, and whether
 * the action carries an id.
 */

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui';
import type { ReferenceOption } from '@/db/queries/admin';
import type { EntityDef, FieldDef, ReferenceKind } from '@/lib/admin/entities';

export interface EntityFormState {
  errors?: Record<string, string>;
  message?: string;
}

export interface EntityFormProps {
  def: EntityDef;
  /** Null when creating. Carried in the form so one action serves both paths. */
  id: number | null;
  defaults: Record<string, unknown>;
  references: Record<ReferenceKind, ReferenceOption[]>;
  action: (state: EntityFormState, formData: FormData) => Promise<EntityFormState>;
  submitLabel: string;
}

const inputClasses =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Guardando…' : label}
    </Button>
  );
}

function defaultValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function Field({
  field,
  value,
  error,
  references,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  references: Record<ReferenceKind, ReferenceOption[]>;
}) {
  const id = `field-${field.name}`;
  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  let control: React.ReactNode;

  if (field.readOnly) {
    control = (
      <p
        id={id}
        className="border-border bg-card-alt text-muted rounded-md border px-3 py-2.5 text-sm"
      >
        {defaultValue(value) || '—'}
      </p>
    );
  } else if (field.kind === 'boolean') {
    control = (
      <span className="flex items-center gap-2">
        <input
          id={id}
          name={field.name}
          type="checkbox"
          defaultChecked={Boolean(value)}
          className="border-border-strong accent-ink size-5 rounded"
          aria-describedby={describedBy || undefined}
        />
        <span className="text-body text-sm">{field.label}</span>
      </span>
    );
  } else if (field.kind === 'enum') {
    control = (
      <select
        id={id}
        name={field.name}
        defaultValue={defaultValue(value)}
        required={field.required}
        aria-describedby={describedBy || undefined}
        className={inputClasses}
      >
        {!field.required ? <option value="">— sin datos —</option> : null}
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {field.optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'reference') {
    control = (
      <select
        id={id}
        name={field.name}
        defaultValue={defaultValue(value)}
        required={field.required}
        aria-describedby={describedBy || undefined}
        className={inputClasses}
      >
        <option value="">— sin asignar —</option>
        {references[field.reference!].map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === 'textarea') {
    control = (
      <textarea
        id={id}
        name={field.name}
        rows={6}
        defaultValue={defaultValue(value)}
        required={field.required}
        aria-describedby={describedBy || undefined}
        className={`${inputClasses} min-h-32 py-2`}
      />
    );
  } else {
    control = (
      <input
        id={id}
        name={field.name}
        type={field.kind === 'number' ? 'number' : 'text'}
        inputMode={field.kind === 'number' ? 'numeric' : undefined}
        defaultValue={defaultValue(value)}
        required={field.required}
        maxLength={field.maxLength}
        min={field.min}
        max={field.max}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={inputClasses}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {field.kind === 'boolean' ? (
        control
      ) : (
        <>
          <label htmlFor={id} className="text-body text-sm font-medium">
            {field.label}
            {field.required ? <span className="text-danger"> *</span> : null}
          </label>
          {control}
        </>
      )}
      {field.help ? (
        <p id={`${id}-help`} className="text-muted text-xs">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EntityForm({
  def,
  id,
  defaults,
  references,
  action,
  submitLabel,
}: EntityFormProps) {
  const [state, formAction] = useActionState<EntityFormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {/* The action reads these rather than trusting a closure, so the same
          exported action serves create and edit and cannot be aimed at another
          entity by a caller that forgets to say which. */}
      <input type="hidden" name="__entity" value={def.key} />
      {id != null ? <input type="hidden" name="__id" value={id} /> : null}

      {state.message ? (
        <p role="alert" className="text-danger text-sm">
          {state.message}
        </p>
      ) : null}

      {def.fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={defaults[field.name]}
          error={state.errors?.[field.name]}
          references={references}
        />
      ))}

      <div className="flex flex-wrap gap-3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

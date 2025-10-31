import { useEffect, useState, type FormEvent } from "react";
import { Button, Input, Textarea } from "@shared/ui";
import type { GalleryInfoPayload } from "../../api";
import type { ReactNode } from "react";

type GalleryInfoFormProps = {
  value: GalleryInfoPayload;
  disabled?: boolean;
  onSubmit: (payload: GalleryInfoPayload) => Promise<void>;
};

type FormState = {
  name: string;
  about: string;
  address: string;
  email: string;
  phone: string;
  instagram: string;
  tags: string;
};

function toFormState(value: GalleryInfoPayload): FormState {
  return {
    name: value.name ?? "",
    about: value.about ?? "",
    address: value.address ?? "",
    email: value.email ?? "",
    phone: value.phone ?? "",
    instagram: value.instagram ?? "",
    tags: value.tags?.join(", ") ?? ""
  };
}

function toPayload(state: FormState): GalleryInfoPayload {
  return {
    name: normalizeField(state.name),
    about: normalizeField(state.about),
    address: normalizeField(state.address),
    email: normalizeField(state.email),
    phone: normalizeField(state.phone),
    instagram: normalizeField(state.instagram),
    tags: parseList(state.tags)
  };
}

function normalizeField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseList(value: string): string[] | null {
  const items = value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

export function GalleryInfoForm({ value, disabled = false, onSubmit }: GalleryInfoFormProps) {
  const [form, setForm] = useState<FormState>(toFormState(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toFormState(value));
  }, [value]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await onSubmit(toPayload(form));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            disabled={disabled || saving}
            placeholder="Gallery name"
          />
        </Field>
        <Field label="Instagram">
          <Input
            value={form.instagram}
            onChange={event => setForm(current => ({ ...current, instagram: event.target.value }))}
            disabled={disabled || saving}
            placeholder="@username"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
            disabled={disabled || saving}
            placeholder="contact@example.com"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.phone}
            onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}
            disabled={disabled || saving}
            placeholder="+1 555 123 4567"
          />
        </Field>
        <Field label="Address" fullWidth>
          <Textarea
            value={form.address}
            onChange={event => setForm(current => ({ ...current, address: event.target.value }))}
            disabled={disabled || saving}
            rows={2}
            placeholder="Street, City"
          />
        </Field>
        <Field label="Tags" fullWidth description="Comma separated list.">
          <Input
            value={form.tags}
            onChange={event => setForm(current => ({ ...current, tags: event.target.value }))}
            disabled={disabled || saving}
            placeholder="contemporary, photography"
          />
        </Field>
        <Field label="About" fullWidth>
          <Textarea
            value={form.about}
            onChange={event => setForm(current => ({ ...current, about: event.target.value }))}
            disabled={disabled || saving}
            rows={6}
            placeholder="Short description about the gallery."
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={disabled || saving}>
          {saving ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  description,
  fullWidth = false,
  children
}: {
  label: string;
  description?: string;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={fullWidth ? "flex flex-col gap-2 md:col-span-2" : "flex flex-col gap-2"}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {description ? <span className="text-xs text-slate-500">{description}</span> : null}
    </label>
  );
}

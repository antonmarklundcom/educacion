type ClassValue = string | number | null | false | undefined | ClassValue[];

function flatten(value: ClassValue, out: string[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, out);
    return;
  }
  out.push(String(value));
}

/** Joins conditional class names, dropping falsy values. No dependency needed for this. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  flatten(values, out);
  return out.join(' ');
}

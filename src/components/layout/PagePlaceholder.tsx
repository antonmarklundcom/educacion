export function PagePlaceholder({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-24">
      <h1 className="text-ink text-2xl font-bold">{title}</h1>
      {detail && <p className="text-body">{detail}</p>}
      <p className="text-muted text-sm">Esta página está en construcción.</p>
    </main>
  );
}

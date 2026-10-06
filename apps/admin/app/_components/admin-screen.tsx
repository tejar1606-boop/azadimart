export function AdminScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="px-8 py-10">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">{description}</p>
    </main>
  );
}

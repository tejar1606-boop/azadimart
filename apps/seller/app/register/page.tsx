function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {children ? <div className="mt-3 text-ink-muted">{children}</div> : null}
    </main>
  );
}

export default function RegisterPage() {
  return <Shell title="Seller registration" />;
}

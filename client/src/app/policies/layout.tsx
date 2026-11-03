import PolicyBackNav from "@/components/PolicyBackNav";

export default function PoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-6 pb-28 sm:py-10 md:pb-16">
        <PolicyBackNav />
        {children}
      </main>
    </div>
  );
}

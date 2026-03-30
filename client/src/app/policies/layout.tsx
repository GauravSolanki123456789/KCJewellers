import PolicyBackNav from "@/components/PolicyBackNav";

export default function PoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10 pb-28 md:pb-16">
        <PolicyBackNav />
        {children}
      </main>
    </div>
  );
}

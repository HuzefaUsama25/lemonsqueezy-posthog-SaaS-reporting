import { DashboardClient } from "@/components/dashboard-client";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto py-10">
        <DashboardClient />
      </main>
    </div>
  );
}

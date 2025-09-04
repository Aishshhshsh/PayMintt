import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "@/components/PaymentForm";
import { PaymentsList } from "@/components/PaymentsList";
import { ReconciliationUpload } from "@/components/ReconciliationUpload";
import { ReconciliationEngine } from "@/components/ReconciliationEngine";
import { SimpleReconciliationDashboard } from "@/components/SimpleReconciliationDashboard";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
  <div className="min-h-screen bg-background p-6">
    <div className="mx-auto max-w-7xl">
      {/* Top bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">PayMint</h1>
          <p className="text-sm text-slate-500">Manage payments and reconciliation</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{user.email}</span>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { k: "Total Processed", v: "$2,565,837.47", sub: "▲ +12.5% vs last month", tone: "text-emerald-600" },
          { k: "Success Rate", v: "98.6%", sub: "▲ +0.3% vs yesterday", tone: "text-emerald-600" },
          { k: "Avg Processing", v: "2.0s", sub: "▼ −0.2s improvement", tone: "text-emerald-600" },
          { k: "Active Connections", v: "142", sub: "Live connections", tone: "text-emerald-600" },
        ].map((c) => (
          <div key={c.k} className="card-tight">
            <div className="text-slate-500 text-sm">{c.k}</div>
            <div className="mt-1 text-2xl font-semibold">{c.v}</div>
            <div className={`text-xs ${c.tone}`}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: "New Payment", href: "#new-payment" },
          { label: "Upload Data", href: "#upload-data" },
          { label: "Reconcile", href: "#reconcile" },
          { label: "Generate Report", href: "#report" },
        ].map((a) => (
          <a key={a.label} href={a.href} className="card-tight hover:shadow-md">
            <div className="font-medium">{a.label}</div>
          </a>
        ))}
      </div>

      {/* Forms / widgets (wrapped for consistent look; components unchanged) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <div id="new-payment" className="card">
          <PaymentForm />
        </div>
        <div id="upload-data" className="card">
          <ReconciliationUpload />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
        <div id="reconcile" className="col-span-1 lg:col-span-3 card">
          <ReconciliationEngine />
        </div>
      </div>

      <div className="space-y-6">
        <div className="card">
          <PaymentsList />
        </div>
        <div id="report" className="card">
          <SimpleReconciliationDashboard />
        </div>
      </div>
    </div>
  </div>
);
};

export default Index;

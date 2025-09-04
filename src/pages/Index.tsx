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
import { useDashboardStats } from "@/hooks/useDashboardStats";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

const fmtDuration = (ms: number | null | undefined) => {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms.toFixed(0)} ms`;
};

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const { stats, loading: statsLoading } = useDashboardStats();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/auth");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/auth");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!user) {
    return null; // redirects to /auth via useEffect
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">PayMint</h1>
            <p className="text-sm text-slate-500">
              Manage payments and reconciliation
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{user.email}</span>
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>

        {/* Stat cards (LIVE) */}
        <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="card-tight">
            <div className="text-sm text-slate-500">Total Processed</div>
            <div className="mt-1 text-2xl font-semibold">
              {statsLoading ? "—" : fmtCurrency(Number(stats?.total_processed ?? 0))}
            </div>
            <div className="text-xs text-emerald-600" />
          </div>

          <div className="card-tight">
            <div className="text-sm text-slate-500">Success Rate</div>
            <div className="mt-1 text-2xl font-semibold">
              {statsLoading ? "—" : `${Number(stats?.success_rate ?? 0).toFixed(2)}%`}
            </div>
            <div className="text-xs text-emerald-600" />
          </div>

          <div className="card-tight">
            <div className="text-sm text-slate-500">Avg Processing</div>
            <div className="mt-1 text-2xl font-semibold">
              {statsLoading ? "—" : fmtDuration(stats?.avg_processing_ms ?? null)}
            </div>
            <div className="text-xs text-emerald-600" />
          </div>

          <div className="card-tight">
            <div className="text-sm text-slate-500">Active Connections</div>
            <div className="mt-1 text-2xl font-semibold">
              {statsLoading ? "—" : (stats?.active_connections ?? 0)}
            </div>
            <div className="text-xs text-emerald-600">Live</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* Forms / widgets */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div id="new-payment" className="card">
            <PaymentForm />
          </div>
          <div id="upload-data" className="card">
            <ReconciliationUpload />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div id="reconcile" className="card col-span-1 lg:col-span-3">
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

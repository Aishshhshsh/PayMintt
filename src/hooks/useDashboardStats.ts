import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Stats = {
  total_processed: number;
  success_rate: number;        // percent, e.g., 98.6
  avg_processing_ms: number;   // e.g., 2000
  active_users: number;
};

export function useDashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchStats() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_dashboard_stats");
    if (!error && Array.isArray(data) && data.length > 0) {
      setStats(data[0] as Stats);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchStats();

    // Realtime: whenever payments change, refresh the stats
    const channel = supabase
      .channel("dashboard-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => { fetchStats(); }
      )
      // Optional: if you use audit_logs for "active users", refresh on that too:
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs" },
        () => { fetchStats(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { stats, loading, refetch: fetchStats };
}

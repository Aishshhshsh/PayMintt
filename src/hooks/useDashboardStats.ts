import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type DashboardStats = {
  total_processed: number | null;
  success_rate: number | null;
  avg_processing_ms: number | null;
  active_connections: number | null;
};

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (!cancelled) {
        if (error) {
          console.error("get_dashboard_stats error:", error);
          setStats(null);
        } else {
          setStats((data && data[0]) ?? null);
        }
        setLoading(false);
      }
    }

    fetchStats();
    const id = setInterval(fetchStats, 10000); // refresh every 10s
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { stats, loading };
}

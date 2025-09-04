import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type DashboardStats = {
  total_processed: number;
  success_rate: number;
  avg_processing_ms: number;
  active_connections: number;
};

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchStats() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (!error && isMounted) {
        setStats(data as DashboardStats);
      }
      setLoading(false);
    }

    fetchStats();

    // Optional: auto-refresh every 30s
    const interval = setInterval(fetchStats, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { stats, loading };
}

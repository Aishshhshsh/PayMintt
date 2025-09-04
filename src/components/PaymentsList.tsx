import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface PaymentRow {
  id: string;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  method: string | null;
  external_id: string | null;
  created_at: string;
}

export function PaymentsList() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();

    // (optional) live refresh on DB changes
    const channel = supabase
      .channel("payments_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => fetchPayments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        setPayments([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("payments")
        .select("id, amount_cents, currency, status, method, external_id, created_at")
        .eq("user_id", user.user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to fetch payments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount_cents: number | null, currency: string | null) => {
    const cents = amount_cents ?? 0;
    const cur = currency || "USD";
    const amount = cents / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  };

  const getStatusBadgeClass = (status: string | null) => {
    switch ((status || "").toLowerCase()) {
      case "succeeded":
      case "completed":
        return "bg-green-100 text-green-800";
      case "processing":
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
      case "error":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading payments…</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No payments found. Create your first payment above.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>External ID</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {formatAmount(p.amount_cents, p.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusBadgeClass(p.status)}>
                      {p.status || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.method || "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {p.external_id || "—"}
                  </TableCell>
                  <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

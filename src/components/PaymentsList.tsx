import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Payment {
  id: string;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  payment_method: string | null;
  external_payment_id: string | null;
  created_at: string;
}

export function PaymentsList() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("payments")
        .select("id, amount_cents, currency, status, payment_method, external_payment_id, created_at")
        .eq("user_id", user.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPayments(data ?? []);
    } catch (err) {
      console.error(err);
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
    if (amount_cents == null || !currency) return "—";
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount_cents / 100);
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "succeeded":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading payments...</div>
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
          <div className="text-center text-muted-foreground py-8">
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
                    {formatAmount(p.amount_cents, p.currency ?? "USD")}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(p.status)}>{p.status ?? "—"}</Badge>
                  </TableCell>
                  <TableCell>{p.payment_method ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {p.external_payment_id ?? "—"}
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function ReconciliationEngine() {
  const [loading, setLoading] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState<any>(null);

  const runReconciliation = async () => {
    setLoading(true);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Authentication required",
          description: "Please log in to run reconciliation",
          variant: "destructive"
        });
        return;
      }

      // Get unmatched reconciliation records
      const { data: unmatchedRecords, error: recordsError } = await supabase
        .from("reconciliation_records")
        .select("*")
        .eq("uploaded_by", user.user.id)
        .eq("status", "unmatched");

      if (recordsError) throw recordsError;

      // Get all payments for this user
      const { data: payments, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", user.user.id);

      if (paymentsError) throw paymentsError;

      let matched = 0;
      let unmatched = 0;

      // Match logic: exact amount and external_payment_id match
      for (const record of unmatchedRecords || []) {
        let matchFound = false;
        
        for (const payment of payments || []) {
          const amountMatch = record.amount === payment.amount;
          const idMatch = record.external_transaction_id === payment.external_payment_id;
          
          if (amountMatch && idMatch) {
            // Found a match
            await supabase
              .from("reconciliation_records")
              .update({ 
                status: "matched",
                matched_payment_id: payment.id 
              })
              .eq("id", record.id);

            matched++;
            matchFound = true;
            break;
          }
        }
        
        if (!matchFound) {
          unmatched++;
        }
      }

      // Create summary
      const summary = {
        total_records: (unmatchedRecords?.length || 0),
        matched,
        unmatched,
        match_rate: unmatchedRecords?.length ? (matched / unmatchedRecords.length * 100).toFixed(1) : "0"
      };

      setLastRunSummary(summary);

      toast({
        title: "Reconciliation complete",
        description: `Matched ${matched} of ${unmatchedRecords?.length || 0} records`
      });

    } catch (error) {
      console.error('Reconciliation error:', error);
      toast({
        title: "Reconciliation failed",
        description: "Failed to run reconciliation process",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reconciliation Engine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runReconciliation} 
          disabled={loading}
          className="w-full"
        >
          {loading ? "Running Reconciliation..." : "Run Reconciliation"}
        </Button>

        {lastRunSummary && (
          <div className="space-y-2">
            <h4 className="font-medium">Last Run Summary:</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Total Records:</span> {lastRunSummary.total_records}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Match Rate:</span> {lastRunSummary.match_rate}%
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  Matched: {lastRunSummary.matched}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-red-50 text-red-700">
                  Unmatched: {lastRunSummary.unmatched}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
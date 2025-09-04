import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function PaymentForm() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    currency: "USD",
    payment_method: "",
    external_payment_id: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Authentication required",
          description: "Please log in to create a payment",
          variant: "destructive"
        });
        return;
      }

      // Use the idempotent payments edge function
      const { data, error } = await supabase.functions.invoke('payments', {
        body: {
          amount_cents: parseInt(formData.amount) * 100,
          currency: formData.currency,
          customer_email: user.user.email,
          payment_method: formData.payment_method,
          metadata: {
            external_payment_id: formData.external_payment_id
          },
          user_id: user.user.id
        },
        headers: {
          'Idempotency-Key': `payment_${Date.now()}_${user.user.id}_${Math.random().toString(36).substr(2, 9)}`
        }
      });

      if (error) throw error;

      toast({
        title: "Payment created",
        description: `Payment ${data.external_payment_id} has been successfully created with status: ${data.status}`
      });

      setFormData({
        amount: "",
        currency: "USD", 
        payment_method: "",
        external_payment_id: "",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Payment</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_method">Payment Method</Label>
            <Input
              id="payment_method"
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              placeholder="credit_card, bank_transfer, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="external_payment_id">External Payment ID</Label>
            <Input
              id="external_payment_id"
              value={formData.external_payment_id}
              onChange={(e) => setFormData({ ...formData, external_payment_id: e.target.value })}
              placeholder="Optional external reference"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating..." : "Create Payment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
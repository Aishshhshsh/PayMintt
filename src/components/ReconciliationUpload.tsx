import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function ReconciliationUpload() {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      toast({
        title: "Invalid file",
        description: "Please select a CSV file",
        variant: "destructive"
      });
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index];
      });
      return record;
    });
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to upload",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast({
          title: "Authentication required",
          description: "Please log in to upload reconciliation data",
          variant: "destructive"
        });
        return;
      }

      const text = await file.text();
      const records = parseCSV(text);

      // Insert reconciliation records
      const recordsToInsert = records.map(record => ({
        file_name: file.name,
        uploaded_by: user.user.id,
        external_transaction_id: record.transaction_id || record.id,
        amount: record.amount ? Math.round(parseFloat(record.amount) * 100) : null,
        currency: record.currency || 'USD',
        transaction_date: record.date ? new Date(record.date).toISOString() : null,
        status: 'unmatched'
      }));

      const { error } = await supabase
        .from("reconciliation_records")
        .insert(recordsToInsert);

      if (error) throw error;

      toast({
        title: "Upload successful",
        description: `${records.length} reconciliation records uploaded`
      });

      setFile(null);
      // Reset the file input
      const fileInput = document.getElementById('csv-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload reconciliation data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Upload Reconciliation Data</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with columns: transaction_id, amount, currency, date
            </p>
          </div>

          <Button 
            onClick={handleUpload} 
            disabled={loading || !file}
            className="w-full"
          >
            {loading ? "Uploading..." : "Upload & Process"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
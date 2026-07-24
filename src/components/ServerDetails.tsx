'use client';

import { useEffect, useState } from 'react';
import { fetchSummary, type SummaryRecord } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ServerDetails() {
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [records, setRecords] = useState<SummaryRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchSummary();
        setTotal(data.totalSubmissions);
        setRecords(data.submissions);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load server details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl min-h-screen">
      <Card className="shadow-2xl">
        <CardHeader>
          <CardTitle>Submission Summary</CardTitle>
          <CardDescription>Total participants: {total}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {records.map((r) => (
            <div key={r.id} className="border-b pb-2">
              <p className="font-medium">{r.name} ({r.email})</p>
              <p className="text-sm text-muted-foreground">Team: {r.team}</p>
              <p className="text-sm">Image: <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" className="underline">view</a></p>
              <p className="text-sm">Certificate: {r.certificateGenerated ? '✅ generated' : '❌ not generated'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

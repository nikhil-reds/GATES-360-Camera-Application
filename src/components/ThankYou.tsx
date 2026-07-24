'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ThankYou() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-xl w-full text-center">
        <CardHeader>
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">Thank you!</CardTitle>
          <CardDescription>Your certificate has been recorded.</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="mb-6">You can close this page or return to the display to view more moments.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push('/display')}>Back to Display</Button>
            <Button variant="outline" onClick={() => router.push('/certificate')}>Generate Another</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

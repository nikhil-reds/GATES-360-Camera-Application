'use client';

import { useState, useEffect } from 'react';
import { fetchCertificates, bulkDeleteCertificates, deleteCertificate } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Trash2, Download } from 'lucide-react';

interface Certificate {
  id: string;
  userName: string;
  userEmail: string;
  teamName?: string;
  designation?: string;
  groupName: string;
  feedback?: string;
  createdAt: number;
}

export default function CertificateManagement() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadCertificates = async () => {
      try {
        const certs = await fetchCertificates();
        // Cast to frontend Certificate type
        setCertificates(certs as unknown as Certificate[]);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching certificates:', error);
        toast.error('Failed to load certificates');
        setIsLoading(false);
      }
    };
    loadCertificates();
  }, []);

  // Group by date
  const groupByDate = () => {
    const grouped: { [key: string]: Certificate[] } = {};
    certificates.forEach((cert) => {
      const date = new Date(cert.createdAt).toLocaleDateString();
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(cert);
    });
    return grouped;
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === certificates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(certificates.map((c) => c.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error('No entries selected');
      return;
    }
    if (!confirm(`Delete ${selectedIds.size} certificate(s)? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      await bulkDeleteCertificates(Array.from(selectedIds));
      setCertificates(prev => prev.filter(c => !selectedIds.has(c.id)));
      toast.success(`Deleted ${selectedIds.size} certificate(s)`);
      setSelectedIds(new Set());
    } catch (error) {
      toast.error('Failed to delete certificates');
    } finally {
      setIsDeleting(false);
    }
  };

  const clearAll = async () => {
    if (certificates.length === 0) {
      toast.error('No certificates to clear');
      return;
    }
    if (!confirm(`Delete ALL ${certificates.length} certificate(s)? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      await bulkDeleteCertificates();
      setCertificates([]);
      toast.success(`Cleared all ${certificates.length} certificates`);
      setSelectedIds(new Set());
    } catch (error) {
      toast.error('Failed to clear certificates');
    } finally {
      setIsDeleting(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Organisation', 'Designation', 'Group', 'Feedback'];
    const rows = certificates.map((c) => [
      new Date(c.createdAt).toLocaleString(),
      c.userName,
      c.userEmail,
      c.teamName || '',
      c.designation || '',
      c.groupName,
      c.feedback || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificates_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const grouped = groupByDate();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-primary">Certificate Management</h1>
          <p className="text-muted-foreground mt-2">View and manage all submitted certificates</p>
        </div>

        {/* Stats & Controls */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Certificates</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{certificates.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-secondary">
                {certificates.filter((c) => new Date(c.createdAt).toDateString() === new Date().toDateString()).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Selected</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{selectedIds.size}</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportCSV} variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={toggleSelectAll} variant="outline">
            {selectedIds.size === certificates.length ? 'Deselect All' : 'Select All'}
          </Button>
          {selectedIds.size > 0 && (
            <Button
              onClick={deleteSelected}
              variant="destructive"
              disabled={isDeleting}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Button onClick={clearAll} variant="destructive" disabled={isDeleting || certificates.length === 0}>
            Clear All
          </Button>
        </div>

        {/* Daily Groups */}
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, certs]) => (
            <Card key={date}>
              <CardHeader>
                <CardTitle>{date}</CardTitle>
                <CardDescription>{certs.length} certificate(s)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={certs.every((c) => selectedIds.has(c.id))}
                            onChange={() => {
                              const newSelected = new Set(selectedIds);
                              const allSelected = certs.every((c) => selectedIds.has(c.id));
                              certs.forEach((c) => {
                                if (allSelected) {
                                  newSelected.delete(c.id);
                                } else {
                                  newSelected.add(c.id);
                                }
                              });
                              setSelectedIds(newSelected);
                            }}
                          />
                        </th>
                        <th className="text-left py-2 px-3">Time</th>
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-left py-2 px-3">Email</th>
                        <th className="text-left py-2 px-3">Organisation</th>
                        <th className="text-left py-2 px-3">Designation</th>
                        <th className="text-left py-2 px-3">Group</th>
                        <th className="text-left py-2 px-3">Feedback</th>
                        <th className="text-left py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certs.map((cert) => (
                        <tr key={cert.id} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(cert.id)}
                              onChange={() => toggleSelect(cert.id)}
                            />
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-xs">
                            {new Date(cert.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="py-3 px-3 font-medium">{cert.userName}</td>
                          <td className="py-3 px-3 text-xs text-muted-foreground">{cert.userEmail}</td>
                          <td className="py-3 px-3">{cert.teamName || '—'}</td>
                          <td className="py-3 px-3">{cert.designation || '—'}</td>
                          <td className="py-3 px-3 text-sm">{cert.groupName}</td>
                          <td className="py-3 px-3 text-xs max-w-xs truncate">{cert.feedback || '—'}</td>
                          <td className="py-3 px-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (confirm('Delete this certificate?')) {
                                  try {
                                    await deleteCertificate(cert.id);
                                    setCertificates(prev => prev.filter(item => item.id !== cert.id));
                                    setSelectedIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(cert.id);
                                      return next;
                                    });
                                    toast.success('Deleted');
                                  } catch (e) {
                                    console.error('Failed to delete certificate:', e);
                                    toast.error('Failed to delete');
                                  }
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {certificates.length === 0 && (
          <Card className="text-center py-12">
            <p className="text-muted-foreground">No certificates yet</p>
          </Card>
        )}
      </div>
    </div>
  );
}

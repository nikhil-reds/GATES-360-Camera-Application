'use client';

import { useState, useEffect, ChangeEvent, FormEvent, useMemo } from 'react';
import Link from 'next/link';
import { fetchImages, createImage, uploadImageToDB, updateImageVisibility, downloadGroupImage, deleteImage as deleteImageApi, fetchCertificates, updateCertificateDisplay, bulkDeleteCertificates, deleteCertificate, updateCertificate } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ImagePlus, Trash2, Eye, EyeOff, Loader2, ExternalLink, Search, Download, FileText } from 'lucide-react';
import { EventImage, CertificateRecord } from '@/types';

const imagePreviewSrc = (id: string) => `/api/images/${encodeURIComponent(id)}/download?inline=1`;

export default function AdminPanel() {
  const [images, setImages] = useState<EventImage[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingImageId, setDownloadingImageId] = useState<string | null>(null);

  // Certificate Management State
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [isCertsLoading, setIsCertsLoading] = useState(true);
  const [selectedCertIds, setSelectedCertIds] = useState<Set<string>>(new Set());
  const [isDeletingCerts, setIsDeletingCerts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'content' | 'certificates'>('content');

  useEffect(() => {
    const loadImages = async () => {
      try {
        const imgs = await fetchImages();
        setImages(imgs);
        setIsLoading(false);
      } catch (err) {
        console.error("Error loading images:", err);
      }
    };
    loadImages();
  }, []);

  useEffect(() => {
    const loadCertificates = async () => {
      try {
        const certs = await fetchCertificates();
        setCertificates(certs);
        setIsCertsLoading(false);
      } catch (err) {
        console.error("Error loading certificates:", err);
        toast.error("Failed to load certificates");
        setIsCertsLoading(false);
      }
    };
    loadCertificates();
  }, []);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const compressAndConvertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 768;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.7 quality to keep document under 1MB limit
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !groupName) {
      toast.error('Please provide both an image and a unique group name');
      return;
    }

    setIsUploading(true);
    try {
      let newImage: EventImage;
      try {
        // First try direct file upload + DB save
        newImage = await uploadImageToDB(selectedFile, groupName.trim());
      } catch (uploadErr) {
        console.warn('Direct upload to DB failed, attempting compressed base64 upload:', uploadErr);
        const base64Url = await compressAndConvertToBase64(selectedFile);
        if (base64Url.length >= 1000000) {
          throw new Error('Image size is too large even after compression. Please choose a smaller image.');
        }
        newImage = await createImage({
          url: base64Url,
          groupName: groupName.trim(),
          timestamp: Date.now(),
        });
      }

      setImages(prev => [newImage, ...prev]);
      setSelectedFile(null);
      setPreviewUrl('');
      setGroupName('');
      toast.success('Image saved to database successfully!');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to save image to database');
    } finally {
      setIsUploading(false);
    }
  };


  const toggleVisibility = async (id: string, current: boolean) => {
    try {
      await updateImageVisibility(id, !current);
      setImages(prev => prev.map(img => img.id === id ? { ...img, isVisible: !current } : img));
      toast.success(`Image ${!current ? 'visible' : 'hidden'}`);
    } catch (error) {
      toast.error('Failed to update visibility');
    }
  };

  const handleDownloadImage = async (image: EventImage) => {
    setDownloadingImageId(image.id);
    try {
      const { blob, filename } = await downloadGroupImage(image.id);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      toast.success(`${image.groupName} image downloaded`);
    } catch (error: any) {
      console.error('Failed to download group image:', error);
      toast.error(error?.message || 'Failed to download group image');
    } finally {
      setDownloadingImageId(null);
    }
  };

  const deleteImage = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;
    try {
      await deleteImageApi(id);
      setImages(prev => prev.filter(img => img.id !== id));
      toast.success('Image deleted');
    } catch (error) {
      toast.error('Failed to delete image');
    }
  };

  const toggleSelectCert = (id: string) => {
    const newSelected = new Set(selectedCertIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCertIds(newSelected);
  };

  const toggleSelectAllCerts = (filteredCerts: CertificateRecord[]) => {
    const allSelected = filteredCerts.length > 0 && filteredCerts.every(c => selectedCertIds.has(c.id));
    const newSelected = new Set(selectedCertIds);
    filteredCerts.forEach(c => {
      if (allSelected) {
        newSelected.delete(c.id);
      } else {
        newSelected.add(c.id);
      }
    });
    setSelectedCertIds(newSelected);
  };

  const deleteSelectedCerts = async () => {
    if (selectedCertIds.size === 0) {
      toast.error('No certificates selected');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the selected ${selectedCertIds.size} certificate(s)?`)) return;

    setIsDeletingCerts(true);
    try {
      await bulkDeleteCertificates(Array.from(selectedCertIds));
      setCertificates(prev => prev.filter(c => !selectedCertIds.has(c.id)));
      toast.success(`Successfully deleted ${selectedCertIds.size} certificate(s)`);
      setSelectedCertIds(new Set());
    } catch (err: any) {
      console.error("Failed to delete certificates:", err);
      toast.error("Failed to delete selected certificates");
    } finally {
      setIsDeletingCerts(false);
    }
  };

  const clearAllCerts = async () => {
    if (certificates.length === 0) {
      toast.error('No certificates to delete');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ALL ${certificates.length} certificate(s)? This cannot be undone.`)) return;

    setIsDeletingCerts(true);
    try {
      await bulkDeleteCertificates();
      setCertificates([]);
      toast.success(`Successfully deleted all ${certificates.length} certificate(s)`);
      setSelectedCertIds(new Set());
    } catch (err: any) {
      console.error("Failed to clear certificates:", err);
      toast.error("Failed to clear certificates");
    } finally {
      setIsDeletingCerts(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Date & Time', 'Name', 'Email', 'Organisation', 'Designation', 'Group Name', 'Certificate URL', 'Feedback'];
    const rows = certificates.map(c => [
      new Date(c.createdAt).toLocaleString(),
      c.userName || '',
      c.userEmail || '',
      c.teamName || '',
      c.designation || '',
      c.groupName || '',
      c.certificateUrl || '',
      (c.feedback || '').replace(/"/g, '""'),
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(val => `"${val}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificates_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully!");
  };

  const toggleShowOnDisplay = async (id: string, current: boolean) => {
    try {
      await updateCertificateDisplay(id, !current);
      setCertificates(prev => prev.map(c => c.id === id ? { ...c, showOnDisplay: !current } : c));
      toast.success(`Display status updated: ${!current ? 'Shown' : 'Hidden'}`);
    } catch (error: any) {
      console.error('Failed to update display status:', error);
      toast.error('Failed to update display status.');
    }
  };

  const availableGroups = useMemo(() => {
    const namesFromImages = images.map(img => img.groupName);
    const namesFromCerts = certificates.map(c => c.groupName).filter(Boolean);
    const allNames = [...namesFromImages, ...namesFromCerts].filter((n): n is string => Boolean(n));
    return Array.from(new Set(allNames)).sort();
  }, [images, certificates]);

  const handleGroupChange = async (id: string, newGroupName: string) => {
    try {
      await updateCertificate(id, { groupName: newGroupName });
      setCertificates(prev => prev.map(c => c.id === id ? { ...c, groupName: newGroupName } : c));
      toast.success(`Group updated to ${newGroupName}`);
    } catch (error: any) {
      console.error('Failed to update group name:', error);
      toast.error('Failed to update group name');
    }
  };

  const filteredCertificates = certificates.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.userName || '').toLowerCase().includes(q) ||
      (c.userEmail || '').toLowerCase().includes(q) ||
      (c.teamName || '').toLowerCase().includes(q) ||
      (c.designation || '').toLowerCase().includes(q) ||
      (c.groupName || '').toLowerCase().includes(q) ||
      (c.feedback || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-4 border-b pb-5 sm:pb-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-black uppercase tracking-tight sm:text-4xl">Controller</h1>
          <p className="text-muted-foreground">Real-time event content management</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:shrink-0">
          <Link href="/display" target="_blank" className="w-full md:w-auto">
            <Button variant="outline" className="w-full gap-2 md:w-auto">
              Display Screen <ExternalLink className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/certificate" target="_blank" className="w-full md:w-auto">
            <Button variant="outline" className="w-full gap-2 md:w-auto">
              User Portal <ExternalLink className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Tab Switcher */}
      <div className="flex overflow-x-auto border-b border-border">
        <button
          onClick={() => setActiveTab('content')}
          className={`-mb-[2px] shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors sm:px-6 ${
            activeTab === 'content'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Content Library
        </button>
        <button
          onClick={() => setActiveTab('certificates')}
          className={`-mb-[2px] shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors sm:px-6 ${
            activeTab === 'certificates'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Certificate Submissions ({certificates.length})
        </button>
      </div>

      {activeTab === 'content' && (
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImagePlus className="w-5 h-5" />
                Upload New Content
              </CardTitle>
              <CardDescription>Select an image and assign a unique group name.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="group-name">Group Name</Label>
                    <Input
                      id="group-name"
                      placeholder="e.g. Group A, Stage 1"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image-file">Image File</Label>
                    <div className="flex items-center gap-3">
                      {previewUrl && (
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                          <img src={previewUrl} alt="Selected image preview" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <Input
                          id="image-file"
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                        {selectedFile && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">{selectedFile.name}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isUploading || !selectedFile}>
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Submit Content
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Content Library</CardTitle>
              <CardDescription>Manage visibility and deletion of uploaded images.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-1 gap-4">
                  {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
                  ) : images.length === 0 ? (
                    <p className="text-center text-muted-foreground p-8">No images uploaded yet.</p>
                  ) : (
                    images.map((img) => (
                      <div key={img.id} className="flex flex-col gap-3 rounded-lg border p-3 transition-shadow hover:shadow-sm sm:flex-row sm:items-center sm:gap-4">
                        <img src={imagePreviewSrc(img.id)} className="h-40 w-full rounded object-cover sm:h-14 sm:w-20" alt={img.groupName} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{img.groupName}</p>
                          <p className="text-xs text-muted-foreground">{new Date(img.timestamp).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                          <div className="flex items-center gap-2 sm:mr-4">
                            {img.isVisible ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                            <Switch
                              checked={img.isVisible}
                              onCheckedChange={() => toggleVisibility(img.id, img.isVisible)}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDownloadImage(img)}
                            disabled={downloadingImageId === img.id}
                            className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                            title={`Download ${img.groupName} image`}
                            aria-label={`Download ${img.groupName} image`}
                          >
                            {downloadingImageId === img.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteImage(img.id)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'certificates' && (
        <div className="space-y-6">
          {/* Stats & Controls */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Submissions</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-extrabold tracking-tight">{certificates.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted Today</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-extrabold tracking-tight text-primary">
                  {certificates.filter(c => new Date(c.createdAt).toDateString() === new Date().toDateString()).length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected Records</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-extrabold tracking-tight text-amber-500">{selectedCertIds.size}</p>
              </CardContent>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 md:flex-row md:items-center">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, company, designation..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-10 w-full bg-background"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button onClick={exportCSV} variant="outline" size="sm" className="h-10 gap-2">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
              <Button
                onClick={() => toggleSelectAllCerts(filteredCertificates)}
                variant="outline"
                size="sm"
                className="h-10"
              >
                {filteredCertificates.length > 0 && filteredCertificates.every(c => selectedCertIds.has(c.id))
                  ? 'Deselect All'
                  : 'Select All'}
              </Button>
              {selectedCertIds.size > 0 && (
                <Button
                  onClick={deleteSelectedCerts}
                  variant="destructive"
                  size="sm"
                  className="col-span-2 h-10 gap-2 sm:col-span-1"
                  disabled={isDeletingCerts}
                >
                  <Trash2 className="w-4 h-4" /> Delete Selected ({selectedCertIds.size})
                </Button>
              )}
              <Button
                onClick={clearAllCerts}
                variant="destructive"
                size="sm"
                className="h-10"
                disabled={isDeletingCerts || certificates.length === 0}
              >
                Clear All
              </Button>
            </div>
          </div>

          {/* Submissions Table Card */}
          <Card className="overflow-hidden border border-border shadow-sm">
            <CardHeader className="border-b bg-muted/30 px-4 py-4 sm:px-6">
              <CardTitle className="text-lg font-bold sm:text-xl">Testimonials & Certificate Section</CardTitle>
              <CardDescription>Comprehensive log of participants, their designations, and event groups.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-3 p-3 md:hidden">
                {isCertsLoading ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span>Loading submissions...</span>
                  </div>
                ) : filteredCertificates.length === 0 ? (
                  <p className="py-10 text-center text-muted-foreground">No submissions found matching your search.</p>
                ) : (
                  filteredCertificates.map((cert) => (
                    <div key={cert.id} className="space-y-3 rounded-lg border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{cert.userName}</p>
                          <p className="break-all text-xs font-mono text-muted-foreground">{cert.userEmail}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={selectedCertIds.has(cert.id)}
                          onChange={() => toggleSelectCert(cert.id)}
                          className="mt-1 shrink-0 rounded border-input text-primary focus:ring-primary"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Date</p>
                          <p className="font-medium">{new Date(cert.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Time</p>
                          <p className="font-medium">{new Date(cert.createdAt).toLocaleTimeString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Organisation</p>
                          <p className="font-medium">{cert.teamName || '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Designation</p>
                          <p className="font-medium">{cert.designation || '—'}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Event Group</p>
                        <select
                          value={cert.groupName}
                          onChange={(e) => handleGroupChange(cert.id, e.target.value)}
                          className="w-full rounded-lg border border-primary/15 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                        >
                          {availableGroups.map((group) => (
                            <option key={group} value={group} className="text-foreground bg-background">
                              {group}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="line-clamp-3 text-xs text-muted-foreground">
                        {cert.feedback || <span className="italic text-muted-foreground/50">No feedback provided</span>}
                      </p>
                      <div className="flex items-center justify-between gap-3 border-t pt-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch
                            checked={cert.showOnDisplay || false}
                            onCheckedChange={() => toggleShowOnDisplay(cert.id, cert.showOnDisplay || false)}
                          />
                          On display
                        </div>
                        <div className="flex items-center gap-2">
                          {cert.certificateUrl && (
                            <a
                              href={cert.certificateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100"
                              title="Download / View Certificate PDF"
                            >
                              <FileText className="h-4 w-4" />
                            </a>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this submission?')) {
                                try {
                                  await deleteCertificate(cert.id);
                                  setCertificates(prev => prev.filter(item => item.id !== cert.id));
                                  setSelectedCertIds(prev => {
                                    const next = new Set(prev);
                                    next.delete(cert.id);
                                    return next;
                                  });
                                  toast.success('Submission deleted');
                                } catch (e) {
                                  console.error('Failed to delete submission:', e);
                                  toast.error('Failed to delete submission');
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="text-left py-3.5 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={filteredCertificates.length > 0 && filteredCertificates.every(c => selectedCertIds.has(c.id))}
                          onChange={() => toggleSelectAllCerts(filteredCertificates)}
                          className="rounded border-input text-primary focus:ring-primary"
                        />
                      </th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Date & Time</th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Name</th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Email</th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Organisation</th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Designation</th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Event Group</th>
                      <th className="text-left font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap">Feedback</th>
                      <th className="text-center font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap w-28">On Display</th>
                      <th className="text-center font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap w-24">Certificate</th>
                      <th className="text-center font-semibold py-3.5 px-4 text-muted-foreground whitespace-nowrap w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isCertsLoading ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <span>Loading submissions...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredCertificates.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-muted-foreground">
                          No submissions found matching your search.
                        </td>
                      </tr>
                    ) : (
                      filteredCertificates.map((cert) => (
                        <tr key={cert.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={selectedCertIds.has(cert.id)}
                              onChange={() => toggleSelectCert(cert.id)}
                              className="rounded border-input text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-xs">
                              {new Date(cert.createdAt).toLocaleDateString()}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(cert.createdAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">{cert.userName}</td>
                          <td className="py-3 px-4 text-xs font-mono text-muted-foreground whitespace-nowrap">{cert.userEmail}</td>
                          <td className="py-3 px-4 whitespace-nowrap">{cert.teamName || <span className="text-muted-foreground/50">—</span>}</td>
                          <td className="py-3 px-4 whitespace-nowrap">{cert.designation || <span className="text-muted-foreground/50">—</span>}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <select
                              value={cert.groupName}
                              onChange={(e) => handleGroupChange(cert.id, e.target.value)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-transparent hover:border-primary/20 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none cursor-pointer"
                            >
                              {availableGroups.map((group) => (
                                <option key={group} value={group} className="text-foreground bg-background">
                                  {group}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 max-w-[200px] truncate text-xs text-muted-foreground" title={cert.feedback}>
                            {cert.feedback || <span className="text-muted-foreground/30 italic">No feedback provided</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Switch
                              checked={cert.showOnDisplay || false}
                              onCheckedChange={() => toggleShowOnDisplay(cert.id, cert.showOnDisplay || false)}
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            {cert.certificateUrl ? (
                              <a
                                href={cert.certificateUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                title="Download / View Certificate PDF"
                              >
                                <FileText className="w-4 h-4" />
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Pending</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                              onClick={async () => {
                                if (confirm('Are you sure you want to delete this submission?')) {
                                  try {
                                    await deleteCertificate(cert.id);
                                    setCertificates(prev => prev.filter(item => item.id !== cert.id));
                                    setSelectedCertIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(cert.id);
                                      return next;
                                    });
                                    toast.success('Submission deleted');
                                  } catch (e) {
                                    console.error('Failed to delete submission:', e);
                                    toast.error('Failed to delete submission');
                                  }
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

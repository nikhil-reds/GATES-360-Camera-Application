'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { fetchImages, createCertificate, uploadFile } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Download, CheckCircle2, Award, Mail } from 'lucide-react';
import { EventImage } from '@/types';
import jsPDF from 'jspdf';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';

// To link your Google Sheet automatically, paste the Web App URL from Extensions -> Apps Script here:
const GOOGLE_SHEETS_WEBHOOK_URL = '';
const PLEDGE_TEMPLATE_URL = '/sanitation-sandbox-pledge-template.png';
const imagePreviewSrc = (id: string) => `/api/images/${encodeURIComponent(id)}/download?inline=1`;

let pledgeTemplateDataUrlPromise: Promise<string> | null = null;

const loadPledgeTemplate = () => {
  if (!pledgeTemplateDataUrlPromise) {
    pledgeTemplateDataUrlPromise = fetch(PLEDGE_TEMPLATE_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load the pledge template');
        return response.blob();
      })
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Unable to read the pledge template'));
        reader.readAsDataURL(blob);
      }));
  }

  return pledgeTemplateDataUrlPromise;
};

export default function CertificateSystem() {
  const [images, setImages] = useState<EventImage[]>([]);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [teamName, setTeamName] = useState(''); // organization / team name
  const [designation, setDesignation] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [currentCertUrl, setCurrentCertUrl] = useState('');
  const [currentCertName, setCurrentCertName] = useState('');
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      try {
        // The certificate form must list every uploaded group, including groups
        // hidden from the rotating big-screen display.
        const imgs = await fetchImages();
        const groups = new Map<string, EventImage>();

        // The API returns newest uploads first, so retain the newest image when
        // the same group has been uploaded more than once.
        imgs.forEach((img) => {
          const groupKey = img.groupName.trim().toLowerCase();
          if (groupKey && !groups.has(groupKey)) {
            groups.set(groupKey, img);
          }
        });

        const unique = Array.from(groups.values()).sort((a, b) =>
          a.groupName.localeCompare(b.groupName, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        );
        setImages(unique);
      } catch (err) {
        console.error("Error loading images:", err);
      }
    };
    loadData();
  }, []);

  const generatePDF = async (name: string) => {
    const templateDataUrl = await loadPledgeTemplate();
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.addImage(templateDataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

    // The participant name is the only personalised content on the pledge.
    const nameLineCenterX = 169;
    const maxNameWidth = 245;
    let nameFontSize = 17;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(nameFontSize);

    while (doc.getTextWidth(name.trim()) > maxNameWidth && nameFontSize > 10) {
      nameFontSize -= 0.5;
      doc.setFontSize(nameFontSize);
    }

    doc.setTextColor(255, 255, 255);
    doc.text(name.trim(), nameLineCenterX, 534, { align: 'center' });

    return doc;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userName || !userEmail || !selectedGroupId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    const selectedImage = images.find(img => img.id === selectedGroupId);
    
    if (!selectedImage) {
      toast.error('Selected group data not found');
      setIsSubmitting(false);
      return;
    }

    try {
      // Generate the fixed pledge design with only the participant name personalised.
      const pdfDoc = await generatePDF(userName);
      const pdfBlob = pdfDoc.output('blob');

      // Build a named File and local object URL so the user can download immediately
      const safeName = `Certificate_${userName.trim().replace(/\s+/g, '_')}.pdf`;
      setCurrentCertName(safeName);
      const pdfFile = new File([pdfBlob], safeName, { type: 'application/pdf' });
      const localUrl = URL.createObjectURL(pdfFile);

      // Show certificate immediately (fast) and clear submitting state
      setCurrentCertUrl(localUrl);
      setIsGenerated(true);
      setIsSubmitting(false);

      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      toast.success('Certificate generated — uploading in background');

      // 2️⃣ Background upload & Firestore save (do not block UI)
      (async () => {
        setBackgroundUploading(true);
        setUploadProgress(0);
        const uid = crypto.randomUUID();
        let certUrl = localUrl;
        try {
          certUrl = await uploadFile(pdfFile, uid, 'certificates', (pct) => setUploadProgress(pct));
        } catch (uploadErr) {
          console.error('Background upload failed, keeping local URL:', uploadErr);
        }

        try {
          await createCertificate({
            userName,
            userEmail,
            teamName,
            designation,
            groupName: selectedImage.groupName,
            imageUrl: selectedImage.url,
            certificateUrl: certUrl,
            feedback,
            showOnDisplay: true,
            createdAt: Date.now()
          });

          // Notify BigScreen to refresh — no polling needed.
          try {
            const channel = new BroadcastChannel('gates360-events');
            channel.postMessage({ type: 'certificate-submitted' });
            channel.close();
          } catch {
            // BroadcastChannel unavailable (e.g. cross-origin iframe) — silently ignore.
          }

          // Send to Google Sheets if Webhook URL is configured
          const sheetsUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL || GOOGLE_SHEETS_WEBHOOK_URL;
          if (sheetsUrl) {
            try {
              await fetch(sheetsUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  date: new Date().toLocaleString(),
                  userName,
                  userEmail,
                  teamName,
                  designation,
                  groupName: selectedImage.groupName,
                  feedback,
                }),
              });
            } catch (sheetErr) {
              console.error('Failed to send to Google Sheets:', sheetErr);
            }
          }

          // Send an email notification to sanitationsandbox@gmail.com with the form data
          try {
            await fetch('https://formsubmit.co/ajax/sanitationsandbox@gmail.com', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                _subject: "New Certificate Form Submission",
                name: userName,
                email: userEmail,
                teamName: teamName,
                designation: designation,
                groupName: selectedImage.groupName,
                feedback: feedback,
              })
            });
          } catch (emailErr) {
            console.error('Failed to send email notification:', emailErr);
          }
        } catch (fsErr: any) {
          console.warn('Firestore save failed in background:', fsErr?.message || fsErr);
          toast.error('Database save failed: ' + (fsErr?.message || fsErr));
        }

        if (certUrl && certUrl !== localUrl) setCurrentCertUrl(certUrl);
        setBackgroundUploading(false);
        setUploadProgress(0);
      })();
    } catch (error) {
      console.error('Certificate processing error:', error);
      const msg = (error && (error as any).message) ? (error as any).message : 'Failed to process your certificate';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadCertificate = async () => {
    const selectedImage = images.find(img => img.id === selectedGroupId);
    if (!selectedImage) return;

    const filename = currentCertName || `Certificate_${userName.replace(/\s+/g, '_')}.pdf`;

    // If we have a stored URL (remote or object URL), try to download that first
    if (currentCertUrl) {
      // If same-origin or object URL, use direct download
      try {
        const a = document.createElement('a');
        a.href = currentCertUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      } catch (e) {
        // fallback to regenerating PDF
        console.warn('Direct download failed, regenerating PDF', e);
      }
    }

    const doc = await generatePDF(userName);
    doc.save(filename);
  };

  const downloadPhoto = async () => {
    const selectedImage = images.find(img => img.id === selectedGroupId);
    if (!selectedImage) return;
    try {
      const res = await fetch(selectedImage.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = `${(userName || 'photo').replace(/\s+/g, '_')}_${selectedImage.id}.jpg`;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to download image');
    }
  };

  const shareViaEmail = () => {
    const selectedImage = images.find(img => img.id === selectedGroupId);
    const subject = `Event Certificate: ${userName}`;
    const body = `Hi,\n\nHere is the certificate for ${userName} from ${teamName || 'N/A'} (${designation || 'N/A'}).\n\nGroup: ${selectedImage?.groupName}\nView Photo: ${selectedImage?.url}\n\nDownload Certificate: ${currentCertUrl}`;
    window.location.href = `mailto:nabeel@redsxp.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (isGenerated) {
    return (
      <div className="min-h-screen w-full bg-[#f2f5f3] flex flex-col items-center justify-center gap-6 p-6">
        <Card className="w-full max-w-2xl text-center border border-neutral-200 bg-white text-neutral-900 shadow-2xl overflow-hidden">
          <div className="h-2 bg-primary" />
          <CardHeader className="pt-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold">Great Job, {userName}!</CardTitle>
            <CardDescription className="text-lg">Your certificate is ready for your collection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-8">
            <div className="relative mx-auto aspect-[595.5/842.25] w-full max-w-sm overflow-hidden rounded-xl border-4 border-white bg-[#07513f] shadow-xl">
              <img
                src={PLEDGE_TEMPLATE_URL}
                className="h-full w-full object-cover"
                alt="Sanitation Sandbox pledge preview"
              />
              <div className="absolute left-[6.8%] top-[62.55%] flex w-[43.5%] -translate-y-1/2 items-end justify-center px-1 text-center">
                <span className="max-w-full truncate text-[clamp(8px,2.3vw,15px)] font-normal leading-none text-white">
                  {userName.trim()}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button onClick={downloadCertificate} size="lg" className="w-full gap-2 text-lg h-14">
                <Download className="w-5 h-5" /> Download PDF Certificate
              </Button>
              <Button onClick={downloadPhoto} variant="outline" className="w-full gap-2 h-12">
                <Download className="w-4 h-4" /> Download Selected Photo
              </Button>
             
              <Button variant="outline" onClick={() => setIsGenerated(false)} className="w-full h-12">
                Generate Another
              </Button>
              <Button variant="ghost" onClick={() => router.push('/certificate/thank-you')} className="w-full h-12">
                Complete
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground">A copy of this record has been saved to your participation history.</p>
          </CardContent>
        </Card>

        {/* Upload loader shifted below the card */}
        {backgroundUploading && (
          <div className="w-full max-w-2xl bg-white border border-neutral-200 rounded-2xl p-6 shadow-lg space-y-3 text-center">
            <div className="flex items-center gap-3 justify-center text-neutral-800 text-sm font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
              <span>Uploading certificate to server... {uploadProgress}%</span>
            </div>
            <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  const selectedImage = images.find(img => img.id === selectedGroupId);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#eef3ef] px-3 py-5 sm:px-6 sm:py-12 lg:py-16">
      <div className="pointer-events-none absolute -left-32 top-24 hidden h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl sm:block" />
      <div className="pointer-events-none absolute -right-32 top-96 hidden h-96 w-96 rounded-full bg-amber-200/35 blur-3xl sm:block" />

      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-4 sm:gap-8">
        {/* Group Image above Card */}
        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="w-full overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-1.5 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.35)] backdrop-blur sm:rounded-[28px] sm:p-2"
            >
              <div className="relative h-[clamp(190px,58vw,260px)] w-full overflow-hidden rounded-xl sm:h-[340px] sm:rounded-[20px] md:h-[416px]">
                <img src={selectedImage.url} alt={selectedImage.groupName} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 via-black/5 to-transparent p-3 sm:p-6">
                  <span className="max-w-full truncate rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-bold tracking-tight text-white shadow-lg backdrop-blur-md sm:px-4 sm:py-2 sm:text-sm">
                    Group: {selectedImage.groupName}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="w-full overflow-hidden rounded-2xl border border-white/80 bg-white text-neutral-900 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.38)] sm:rounded-[28px]">
          <div className="relative flex min-h-40 flex-col items-start justify-end overflow-hidden bg-gradient-to-br from-[#102d22] via-[#183f30] to-neutral-950 px-4 py-6 sm:min-h-52 sm:px-10 sm:py-9">
            <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[36px] border-white/5" />
            <Award className="absolute -bottom-10 right-1 h-36 w-36 rotate-12 text-white/10 sm:right-5 sm:h-52 sm:w-52" />
            <span className="relative z-10 mb-3 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300 sm:mb-4 sm:text-[11px] sm:tracking-[0.22em]">
              GATES · 360 Experience
            </span>
            <h2 className="relative z-10 text-2xl font-black tracking-tight text-white sm:text-4xl">Your moment. Your certificate.</h2>
            <p className="relative z-10 mt-2 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
              Tell us a little about yourself and we’ll prepare your personalised Sanitation Sandbox certificate.
            </p>
          </div>
          <CardHeader className="px-4 pt-6 sm:px-10 sm:pt-9">
            <CardTitle className="text-xl font-black tracking-tight text-neutral-950 sm:text-2xl">Claim your certificate</CardTitle>
            <CardDescription className="text-sm leading-relaxed text-neutral-500">
              All fields marked with <span className="font-semibold text-amber-600">*</span> are required.
            </CardDescription>
          </CardHeader>
        <CardContent className="px-4 pb-6 sm:px-10 sm:pb-10">
          <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-7">
            <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
               <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-bold text-neutral-700">Full Name <span className="text-amber-600">*</span></Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Enter your full name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="h-12 rounded-xl border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/15"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-bold text-neutral-700">Email Address <span className="text-amber-600">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="h-12 rounded-xl border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/15"
                  required
                />
              </div>

                <div className="space-y-2">
                  <Label htmlFor="organisation" className="text-sm font-bold text-neutral-700">Organisation / Company <span className="text-amber-600">*</span></Label>
                  <Input
                    id="organisation"
                    autoComplete="organization"
                    placeholder="Where do you work?"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="h-12 rounded-xl border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/15"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="designation" className="text-sm font-bold text-neutral-700">Designation <span className="text-amber-600">*</span></Label>
                  <Input
                    id="designation"
                    autoComplete="organization-title"
                    placeholder="Your role or title"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="h-12 rounded-xl border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/15"
                    required
                  />
                </div>

               <div className="space-y-2 md:col-span-2">
                <Label htmlFor="group" className="text-sm font-bold text-neutral-700">Select Your Event Group <span className="text-amber-600">*</span></Label>
                <Select value={selectedGroupId} onValueChange={(value) => setSelectedGroupId(value ?? '')} required>
                  <SelectTrigger id="group" className="h-12 w-full rounded-xl border-neutral-200 bg-neutral-50 px-4 text-[15px] text-neutral-950 focus-visible:border-emerald-700 focus-visible:ring-emerald-700/15">
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent className="group-select-scroll max-h-64 overflow-y-scroll overscroll-contain">
                    {images.length === 0 ? (
                      <SelectItem value="none" disabled>No groups found</SelectItem>
                    ) : (
                      images.map((img) => (
                        <SelectItem key={img.id} value={img.id} className="py-2.5">
                          <div className="flex items-center gap-2">
                            <img src={imagePreviewSrc(img.id)} className="w-6 h-4 rounded object-cover" alt="" />
                            {img.groupName}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                  <Label htmlFor="feedback" className="text-sm font-bold text-neutral-700">How was your experience?</Label>
                  <span className="text-xs tabular-nums text-neutral-400">{feedback.length}/500</span>
                </div>
                <textarea
                  id="feedback"
                  className="min-h-[132px] w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[15px] leading-relaxed text-neutral-950 caret-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Share a memorable takeaway from the Sanitation Sandbox..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  maxLength={500}
                />
                <p className="text-xs leading-relaxed text-neutral-400">Optional — your feedback may appear in the event display.</p>
              </div>
            </div>

            <Button type="submit" className="h-14 w-full gap-2 rounded-xl bg-[#173c2e] text-base font-bold text-white shadow-lg shadow-emerald-950/15 transition hover:bg-[#102d22] hover:shadow-xl disabled:bg-neutral-300" disabled={isSubmitting || images.length === 0}>
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Generate My Certificate
            </Button>
            <p className="text-center text-xs leading-relaxed text-neutral-400">
              Your details are used only to generate and deliver your certificate.
            </p>
          </form>
        </CardContent>
      </Card>

      </div>
    </div>
  );
}

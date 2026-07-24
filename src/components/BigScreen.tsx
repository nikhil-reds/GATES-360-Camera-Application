'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchCertificates, fetchImages, CertificateRecord } from '@/lib/api';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { EventImage } from '@/types';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
} from 'lucide-react';

const GROUP_DURATION = 8000;
const TESTIMONIAL_DURATION = 5000;
const PROGRESS_STEP = 50;

const normalizeGroupName = (groupName?: string) => groupName?.trim().toLowerCase() || '';
const displayImageSrc = (id: string) => `/api/images/${encodeURIComponent(id)}/download?inline=1`;

const slideVariants = {
  enter: (direction: 'forward' | 'backward') => ({
    x: direction === 'forward' ? '100%' : '-100%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: 'forward' | 'backward') => ({
    x: direction === 'forward' ? '-100%' : '100%',
    opacity: 0,
  }),
};

function QrCard({ certificateUrl }: { certificateUrl: string }) {
  return (
    <div
      data-testid="qr-card"
      className="qr-card flex h-full min-h-0 w-[clamp(6rem,40%,20rem)] shrink-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-amber-400 bg-white p-2 shadow-xl transition-transform duration-300 hover:scale-[1.02] sm:gap-2 md:rounded-2xl md:p-2.5 lg:p-3 xl:p-4 2xl:rounded-3xl 2xl:border-4 2xl:p-5"
    >
      <div className="qr-card-copy shrink-0 text-center">
        <p className="text-xs font-black leading-tight text-neutral-800 xl:text-sm 2xl:text-lg">GET YOUR</p>
        <p className="mb-1 text-xs font-black leading-tight text-amber-500 xl:text-sm 2xl:text-lg">PHOTOGRAPH</p>
        <p className="text-[8px] uppercase tracking-wider text-neutral-400 xl:text-[10px] 2xl:text-xs">Scan to Claim</p>
      </div>
      <div className="min-h-0 max-h-32 max-w-full flex-1 aspect-square rounded-lg bg-white p-1">
        <QRCodeSVG value={certificateUrl} className="h-full w-full" level="H" />
      </div>
    </div>
  );
}

export default function BigScreen() {
  const [images, setImages] = useState<EventImage[]>([]);
  const [testimonials, setTestimonials] = useState<CertificateRecord[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const [certificateUrl, setCertificateUrl] = useState('/certificate');

  useEffect(() => {
    setCertificateUrl(`${window.location.origin}/certificate`);
  }, []);

  useEffect(() => {
    const loadImages = async () => {
      try {
        const fetchedImages = await fetchImages(true);
        setImages(fetchedImages);
      } catch (error) {
        console.error('Error loading group images:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const loadTestimonials = async () => {
      try {
        const certificates = await fetchCertificates(true);
        setTestimonials(
          certificates.filter(
            (certificate) =>
              certificate.userEmail !== 'system-intro@gates.com' &&
              Boolean(certificate.feedback?.trim())
          )
        );
      } catch (error) {
        console.error('Error loading testimonials:', error);
      }
    };

    // Initial load.
    void loadImages();
    void loadTestimonials();

    // 1. Real-time cross-device notification stream (Server-Sent Events)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/stream');
      eventSource.addEventListener('update', () => {
        void loadImages();
        void loadTestimonials();
      });
      eventSource.onerror = (err) => {
        console.warn('SSE stream error, EventSource will automatically reconnect:', err);
      };
    } catch (err) {
      console.warn('Failed to initialize EventSource:', err);
    }

    // 2. Local tab notification channel (instant same-device sync)
    const channel = new BroadcastChannel('gates360-events');
    channel.addEventListener('message', (event) => {
      if (event.data?.type === 'certificate-submitted' || event.data?.type === 'content-updated') {
        void loadImages();
        void loadTestimonials();
      }
    });

    // 3. Tab visibility sync (refresh when window is brought back into focus)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadImages();
        void loadTestimonials();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      channel.close();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const groupImages = useMemo(() => {
    const newestImageByGroup = new Map<string, EventImage>();

    // The API returns newest first, so the first image for a group is retained.
    images.forEach((image) => {
      const groupKey = normalizeGroupName(image.groupName);
      if (groupKey && !newestImageByGroup.has(groupKey)) {
        newestImageByGroup.set(groupKey, image);
      }
    });

    return Array.from(newestImageByGroup.values()).sort((a, b) =>
      a.groupName.localeCompare(b.groupName, undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }, [images]);

  useEffect(() => {
    if (currentImageIndex >= groupImages.length) {
      setCurrentImageIndex(0);
      setProgress(0);
    }
  }, [currentImageIndex, groupImages.length]);

  const currentImage = groupImages[currentImageIndex] ?? null;

  const currentTestimonial = testimonials[currentTestimonialIndex] ?? null;

  useEffect(() => {
    if (currentTestimonialIndex >= testimonials.length) {
      setCurrentTestimonialIndex(0);
    }
  }, [currentTestimonialIndex, testimonials.length]);

  // Testimonials rotate independently and intentionally have no playback controls.
  useEffect(() => {
    if (testimonials.length <= 1) return;

    const interval = window.setInterval(() => {
      setCurrentTestimonialIndex((index) => (index + 1) % testimonials.length);
    }, TESTIMONIAL_DURATION);

    return () => window.clearInterval(interval);
  }, [testimonials.length]);

  const showNextGroup = () => {
    if (groupImages.length === 0) return;
    setDirection('forward');
    setCurrentImageIndex((index) => (index + 1) % groupImages.length);
    setProgress(0);
  };

  const showPreviousGroup = () => {
    if (groupImages.length === 0) return;
    setDirection('backward');
    setCurrentImageIndex((index) => (index - 1 + groupImages.length) % groupImages.length);
    setProgress(0);
  };

  // Playback controls affect only the upper group-image card.
  useEffect(() => {
    if (isPaused || groupImages.length <= 1) return;

    const interval = window.setInterval(() => {
      setProgress((currentProgress) => {
        const nextProgress = currentProgress + (PROGRESS_STEP / GROUP_DURATION) * 100;
        if (nextProgress >= 100) {
          setDirection('forward');
          setCurrentImageIndex((index) => (index + 1) % groupImages.length);
          return 0;
        }
        return nextProgress;
      });
    }, PROGRESS_STEP);

    return () => window.clearInterval(interval);
  }, [groupImages.length, isPaused]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (error) {
      console.error('Unable to toggle fullscreen mode:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#181816] text-white">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-amber-400" />
        <p className="text-xl font-medium uppercase tracking-widest">Initializing Display...</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full select-none flex-col overflow-hidden bg-[#181816] font-sans text-black">
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="absolute right-3 top-3 z-[100] flex items-center justify-center rounded-full border border-white/30 bg-black/70 p-2.5 text-white shadow-xl backdrop-blur-sm transition hover:bg-black/90 active:scale-95 sm:right-4 sm:top-4"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen'}
      >
        {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      </button>

      <div className="relative flex h-full w-full flex-col gap-4 bg-white p-4 sm:gap-6 sm:p-6 lg:gap-8 lg:p-8">
        <div className="pointer-events-none absolute inset-3 rounded-xl border border-neutral-200 sm:inset-4 lg:inset-6" />

        {/* Card 01: the only user-controlled slideshow. */}
        <div className="relative z-10 h-1/2 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-950">
          <AnimatePresence mode="wait" custom={direction}>
            {currentImage ? (
              <motion.div
                key={currentImage.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <img
                  src={displayImageSrc(currentImage.id)}
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl"
                  alt=""
                />
                <div className="relative z-10 flex h-[82%] max-w-[90%] items-center justify-center rounded-2xl border border-white/25 bg-white/10 p-2 shadow-2xl backdrop-blur-md">
                  <img
                    src={displayImageSrc(currentImage.id)}
                    className="h-full max-w-full rounded-xl object-contain shadow-md"
                    alt={`${currentImage.groupName} group`}
                  />
                </div>
              </motion.div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-400">
                <Award className="h-16 w-16 text-neutral-300" />
                <span className="text-sm font-semibold uppercase tracking-wider">Waiting for group images...</span>
              </div>
            )}
          </AnimatePresence>

          {currentImage && (
            <div className="absolute left-3 top-3 z-30 rounded-full border border-neutral-200 bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-800 shadow-sm backdrop-blur-sm sm:left-4 sm:top-4">
              📷 {currentImage.groupName}
              <span className="ml-2 text-neutral-400">
                {currentImageIndex + 1}/{groupImages.length}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsPaused((paused) => !paused)}
            className="absolute bottom-3 left-3 z-30 flex items-center justify-center rounded-full border border-white/25 bg-black/60 p-2 text-white shadow-lg transition hover:bg-black/80 active:scale-95 sm:bottom-4 sm:left-4 sm:p-3 md:left-6"
            title={isPaused ? 'Play group images' : 'Pause group images'}
          >
            {isPaused ? <Play className="h-5 w-5 fill-white" /> : <Pause className="h-5 w-5 fill-white" />}
          </button>

          <button
            type="button"
            onClick={showPreviousGroup}
            className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/60 p-2 text-white shadow-lg transition hover:bg-black/80 active:scale-95 sm:left-4 sm:p-3 md:left-6"
            title="Previous group image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={showNextGroup}
            className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/60 p-2 text-white shadow-lg transition hover:bg-black/80 active:scale-95 sm:right-4 sm:p-3 md:right-6"
            title="Next group image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 flex w-[60%] -translate-x-1/2 translate-y-1/2 items-center">
            <div
              className="relative h-2 w-full overflow-hidden rounded-sm bg-white/20 md:h-3"
              style={{ clipPath: 'polygon(0% 100%, 50% 0%, 100% 100%)' }}
            >
              <div
                style={{ width: `${progress}%` }}
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-75 ease-linear"
              />
            </div>
          </div>
        </div>

        {/* Independent testimonial carousel: no playback or arrow controls. */}
        <div className="z-10 flex min-h-0 w-full flex-1 flex-row gap-4 sm:gap-6 lg:gap-8">
          <div className="relative flex min-w-0 flex-1 flex-col justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-4 sm:px-8 sm:py-6 md:px-12 md:py-8">
            <AnimatePresence mode="wait">
              {currentTestimonial ? (
                <motion.div
                  key={currentTestimonial.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.45 }}
                >
                  <p className="text-sm font-medium italic leading-relaxed text-neutral-800 sm:text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl 3xl:text-4xl">
                    “{currentTestimonial.feedback}”
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:gap-2">
                    <span className="text-xs font-bold uppercase text-amber-600 sm:text-sm md:text-base lg:text-lg xl:text-xl 2xl:text-2xl">
                      {currentTestimonial.userName || 'Anonymous'}
                    </span>
                    <span className="text-xxs text-neutral-400 sm:text-xs">|</span>
                    <span className="text-xxs font-semibold uppercase tracking-wider text-neutral-500 sm:text-xs md:text-sm lg:text-base xl:text-lg 2xl:text-xl">
                      {[currentTestimonial.designation, currentTestimonial.teamName]
                        .filter(Boolean)
                        .join(' at ') || 'Participant'}
                    </span>
                  </div>
                  {testimonials.length > 1 && (
                    <span className="absolute bottom-3 right-4 text-[10px] font-semibold tabular-nums text-neutral-400 sm:bottom-4 sm:right-6">
                      {currentTestimonialIndex + 1} / {testimonials.length}
                    </span>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="no-testimonial"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center sm:text-left"
                >
                  <p className="text-base font-bold uppercase tracking-wide text-neutral-800 sm:text-lg md:text-xl lg:text-2xl xl:text-3xl">
                    {currentImage?.groupName || 'Sanitation Sandbox'}
                  </p>
                  <p className="mt-2 text-xs font-medium text-neutral-500 sm:text-sm md:text-base lg:text-lg">
                    Group capture from the Sanitation Sandbox experience.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <QrCard certificateUrl={certificateUrl} />
        </div>
      </div>
    </div>
  );
}

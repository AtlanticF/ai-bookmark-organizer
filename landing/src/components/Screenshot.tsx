import { useState } from "react";

interface ScreenshotProps {
  src: string;
  alt: string;
  className?: string;
}

export function Screenshot({ src, alt, className = "" }: ScreenshotProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const showPlaceholder = !loaded || error;

  return (
    <div className={`relative aspect-video overflow-hidden rounded-xl bg-neutral-100 ${className}`}>
      {showPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
          Screenshot
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover object-top transition-opacity duration-200 ${showPlaceholder ? "opacity-0" : "opacity-100"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
}

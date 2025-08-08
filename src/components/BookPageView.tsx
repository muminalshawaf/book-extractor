import React from "react";

export const BookPageView = React.forwardRef<HTMLDivElement, { page: { src: string; alt: string } }>(
  ({ page }, ref) => (
    <div className="bg-card h-full w-full" ref={ref}>
      <div className="flex items-center justify-center h-full w-full p-3">
        <img
          src={page.src}
          alt={page.alt}
          loading="lazy"
          decoding="async"
          className="max-w-full max-h-full object-contain select-none"
        />
      </div>
    </div>
  )
);

BookPageView.displayName = "BookPageView";

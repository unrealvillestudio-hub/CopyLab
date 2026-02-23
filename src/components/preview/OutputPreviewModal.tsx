import React from 'react';

export const OutputPreviewModal = ({ output, onClose }: any) => {
  if (!output) return null;
  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8">
      <div className="max-w-4xl w-full bg-uv-card rounded-2xl overflow-hidden">
        {/* Preview content */}
      </div>
    </div>
  );
};

import React from 'react';

export const AssetThumb = ({ asset }: any) => (
  <div className="aspect-square bg-uv-border rounded-lg overflow-hidden relative group cursor-pointer">
    <img src={asset.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
  </div>
);

export const LibraryDock = () => (
  <div className="flex gap-2 p-2 overflow-x-auto">
    {/* Library items */}
  </div>
);

export const UploadDropzone = () => (
  <div className="border-2 border-dashed border-uv-border rounded-xl p-8 text-center hover:border-accent transition-colors cursor-pointer">
    <p className="text-uv-text-muted">Drop files here or click to upload</p>
  </div>
);

export const UploadInbox = () => (
  <div className="space-y-2">
    {/* Uploading items */}
  </div>
);

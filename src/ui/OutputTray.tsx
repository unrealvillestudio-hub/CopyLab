import React from 'react';

export const OutputTray = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed bottom-0 left-0 right-0 bg-uv-bg/80 backdrop-blur-xl border-t border-uv-border p-4 z-40">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      {children}
    </div>
  </div>
);

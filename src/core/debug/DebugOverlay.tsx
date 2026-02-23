import React from 'react';
import { BUILD_TAG } from '../../config/buildTag';

export const DebugOverlay = () => {
  if (process.env.NODE_ENV === 'production') return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <div className="bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] font-mono text-white/50 uppercase tracking-widest">
        DEBUG MODE // {BUILD_TAG}
      </div>
    </div>
  );
};

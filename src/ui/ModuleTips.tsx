import React from 'react';
import { Info } from 'lucide-react';

export const ModuleTips = ({ tips }: { tips: string[] }) => (
  <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl flex gap-3">
    <Info className="w-5 h-5 text-accent shrink-0" />
    <div className="space-y-1">
      {tips.map((tip, i) => (
        <p key={i} className="text-xs text-accent/90">{tip}</p>
      ))}
    </div>
  </div>
);

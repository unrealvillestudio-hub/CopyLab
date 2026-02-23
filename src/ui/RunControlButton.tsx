import React from 'react';
import { Play, Loader2 } from 'lucide-react';
import { Button } from './components';

export const RunControlButton = ({ isLoading, onClick, label = "Generate" }: any) => (
  <Button 
    onClick={onClick} 
    disabled={isLoading}
    className="h-12 px-8 flex items-center gap-2 text-lg"
  >
    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
    {label}
  </Button>
);

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-uv-card border border-uv-border rounded-xl overflow-hidden", className)}>
    {children}
  </div>
);

export const Button = ({ children, onClick, className, variant = 'primary' }: any) => {
  const variants: any = {
    primary: 'bg-accent text-black hover:bg-accent/90',
    secondary: 'bg-uv-border text-uv-text hover:bg-uv-border/80',
    ghost: 'hover:bg-white/5 text-uv-text-muted hover:text-uv-text'
  };
  
  return (
    <button 
      onClick={onClick}
      className={cn("px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50", variants[variant], className)}
    >
      {children}
    </button>
  );
};

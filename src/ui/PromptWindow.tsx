import React from 'react';
import { Card } from './components';

export const PromptWindow = ({ value, onChange, placeholder }: any) => (
  <Card className="p-4">
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-32 bg-transparent border-none focus:ring-0 resize-none text-lg font-medium placeholder:text-uv-text-muted"
    />
  </Card>
);

import React from 'react';

export const RightDrawer = ({ isOpen, onClose, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-uv-bg border-l border-uv-border z-50 p-6 shadow-2xl">
      {children}
    </div>
  );
};

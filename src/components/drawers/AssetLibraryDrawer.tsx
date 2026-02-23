import React from 'react';
import { Card } from '../../ui/components';

export const AssetLibraryDrawer = ({ isOpen, onClose }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-y-0 left-0 w-80 bg-uv-bg border-r border-uv-border z-50 p-4">
      <h2 className="text-xl font-bold mb-4">Asset Library</h2>
      {/* Library content */}
    </div>
  );
};

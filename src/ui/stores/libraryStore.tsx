import { create } from 'zustand';

export const useLibraryStore = create((set) => ({
  assets: [],
  addAsset: (asset: any) => set((state: any) => ({ assets: [asset, ...state.assets] })),
  removeAsset: (id: string) => set((state: any) => ({ assets: state.assets.filter((a: any) => a.id !== id) })),
}));

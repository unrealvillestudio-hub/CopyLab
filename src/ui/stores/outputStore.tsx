import { create } from 'zustand';

export const useOutputStore = create((set) => ({
  outputs: [],
  addOutput: (output: any) => set((state: any) => ({ outputs: [output, ...state.outputs] })),
  clearOutputs: () => set({ outputs: [] }),
}));

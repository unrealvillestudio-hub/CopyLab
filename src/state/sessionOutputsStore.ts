import { create } from 'zustand';

export const useSessionOutputsStore = create((set) => ({
  sessionOutputs: [],
  addSessionOutput: (output: any) => set((state: any) => ({ sessionOutputs: [output, ...state.sessionOutputs] })),
}));

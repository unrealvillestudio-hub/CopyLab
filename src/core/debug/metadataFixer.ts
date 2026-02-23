export const fixMetadata = (data: any) => {
  // Generic metadata fixer logic
  return {
    ...data,
    _fixed: true,
    _timestamp: Date.now()
  };
};

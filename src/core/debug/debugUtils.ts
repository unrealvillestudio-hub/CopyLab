export const logDebug = (message: string, data?: any) => {
  console.log(`[DEBUG] ${message}`, data || '');
};

export const warnDebug = (message: string, data?: any) => {
  console.warn(`[DEBUG] ${message}`, data || '');
};

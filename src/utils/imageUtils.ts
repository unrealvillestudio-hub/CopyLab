export const resizeImage = async (file: File, width: number, height: number): Promise<string> => {
  return URL.createObjectURL(file); // Mock implementation
};

export const getBase64 = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
};

export const generateSeed = () => Math.floor(Math.random() * 1000000);

export const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

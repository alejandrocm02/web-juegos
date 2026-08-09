// Tailwind v4 saco el plugin de PostCSS a su propio paquete, y el autoprefixer
// dejo de hacer falta porque el motor nuevo ya emite los prefijos.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

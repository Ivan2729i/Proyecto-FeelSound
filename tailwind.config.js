/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './templates/**/*.html',
    './**/*/templates/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#4285F4',            // Azul principal de botones y acentos
        'primary-hover': '#357AE8',      // Azul más oscuro para el hover
        'background': '#101A33',         // Fondo oscuro (inicio del degradado)
        'background-end': '#0A0F21',     // Fondo oscuro (fin del degradado)
        'card': '#2B3A5A',               // Color de la tarjeta y los inputs
        'card-border': '#3E4E71',        // Borde de la tarjeta y los inputs
        'text-main': '#FFFFFF',          // Texto principal blanco
        'text-muted': '#8e9bb5',         // Texto secundario y placeholders
        'separator': '#4B5563',          // Color de la línea separadora (equivale a gray-600)
      },
      fontFamily: {
        'sans': ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
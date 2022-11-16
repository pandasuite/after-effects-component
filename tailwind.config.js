const plugin = require('tailwindcss/plugin');

module.exports = {
  presets: [
    require('pandasuite-bridge/tailwind.config'),
  ],
  plugins: [
    plugin(({ addComponents }) => {
      addComponents(require('pandasuite-bridge/tailwind.components.config'));
    }),
  ],
};

module.exports = function override(config, env) {
  // Add the alias configuration
  config.resolve = {
    ...config.resolve,
    alias: {
      ...config.resolve.alias,
      "react/jsx-runtime.js": "react/jsx-runtime",
      "react/jsx-dev-runtime.js": "react/jsx-dev-runtime"
    }
  };

  return config;
}; 
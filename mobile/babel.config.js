module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo handles the worklets/reanimated transform automatically
    // when those packages are present; no manual plugins needed here.
    presets: ['babel-preset-expo'],
  };
};

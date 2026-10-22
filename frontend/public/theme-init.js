(function () {
  try {
    var theme = window.localStorage.getItem('calculator.theme.v1');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    // Storage unavailable (private mode, blocked cookies): the system preference applies.
  }
})();

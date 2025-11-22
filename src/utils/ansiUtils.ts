// Helper function to strip ANSI escape codes
export const stripAnsi = (str: string): string => {
  // This regex is designed to strip ANSI color codes from the string.
  const ansiRegex = /[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
  return str.replace(ansiRegex, '');
};
/**
 * File header instruction format for code files.
 * 
 * This format is used to maintain consistent headers across files.
 * Headers should be placed at the top of the file with appropriate
 * comment syntax based on file type.
 */
export const FILE_HEADER_INSTRUCTION = `/* filename.ext
 *
 * [Descriptive explanation of what the code in the file does. List dependencies here.]
 *
 * Created on: [Date]
 * Modified on: [Date]
 *     Author: [Model Name]
 */`;

/**
 * Get the comment style for a file based on its extension.
 */
export function getFileCommentStyle(filePath: string): { 
  prefix: string; 
  linePrefix: string; 
  suffix: string; 
  skipHeader?: boolean 
} {
  const ext = filePath.toLowerCase().split(".").pop() || "";

  switch (ext) {
    case "html":
      return { prefix: "<!--", linePrefix: " ", suffix: "-->" };
    case "css":
      return { prefix: "/*", linePrefix: " ", suffix: "*/" };
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
      return { prefix: "//", linePrefix: " ", suffix: "" };
    case "py":
      return { prefix: "#", linePrefix: " ", suffix: "" };
    case "json":
      return { prefix: "", linePrefix: "", suffix: "", skipHeader: true };
    default:
      return { prefix: "/*", linePrefix: " ", suffix: "*/" };
  }
}

/**
 * Generate a file header with the given filename, author, and optional description.
 * 
 * @param filename - The name of the file (not the full path)
 * @param author - The author/model name to include in the header
 * @param description - Optional description of the file's purpose
 * @returns The formatted header string
 */
export function generateFileHeader(
  filename: string,
  author: string,
  description: string = "[Descriptive explanation of what the code in the file does. List dependencies here.]",
  modifiedDate?: string,
): string {
  const commentStyle = getFileCommentStyle(filename);

  if (commentStyle.skipHeader) {
    return "";
  }

  const currentDate = new Date().toDateString();
  const modDate = modifiedDate || currentDate;

  if (commentStyle.prefix === "//" || commentStyle.prefix === "#") {
    return `${commentStyle.prefix} ${filename}
 ${commentStyle.prefix}${commentStyle.linePrefix} ${description}
 ${commentStyle.prefix}${commentStyle.linePrefix} 
 ${commentStyle.prefix}${commentStyle.linePrefix} Created on: ${currentDate}
 ${commentStyle.prefix}${commentStyle.linePrefix} Modified on: ${modDate}
 ${commentStyle.prefix}${commentStyle.linePrefix}     Author: ${author}`;
  } else {
    return `${commentStyle.prefix} ${filename}
 ${commentStyle.linePrefix} *
 ${commentStyle.linePrefix} * ${description}
 ${commentStyle.linePrefix} *
 ${commentStyle.linePrefix} * Created on: ${currentDate}
 ${commentStyle.linePrefix} * Modified on: ${modDate}
 ${commentStyle.linePrefix} *     Author: ${author}
 ${commentStyle.suffix}`;
  }
}

/**
 * Check if a file already has a header comment.
 * 
 * @param content - The file content to check
 * @param filePath - The file path to determine comment style
 * @returns True if the file has a header, false otherwise
 */
export function hasFileHeader(content: string, filePath: string): boolean {
  const commentStyle = getFileCommentStyle(filePath);
  
  if (commentStyle.skipHeader) {
    return false;
  }

  const lines = content.split("\n");
  
  if (commentStyle.prefix === "//" || commentStyle.prefix === "#") {
    // Single-line comment style
    if (lines.length < 5) return false;
    // Check if first line starts with the comment prefix and contains filename
    const firstLine = lines[0].trim();
    return firstLine.startsWith(commentStyle.prefix) && firstLine.includes(filenameFromPath(filePath));
  } else {
    // Multi-line comment style (/* ... */)
    if (lines.length < 8) return false;
    // Check if first line starts with /* and last line of header ends with */
    const firstLine = lines[0].trim();
    const lastLine = lines[lines.length - 1].trim();
    return firstLine.startsWith(commentStyle.prefix) && lastLine.endsWith(commentStyle.suffix);
  }
}

/**
 * Extract filename from a full path.
 */
export function filenameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "";
}

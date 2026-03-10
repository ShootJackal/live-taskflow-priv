interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function stripJsonHijackPrefix(text: string): string {
  return text.trim().replace(/^\)\]\}'\n?/, "");
}

export function parseGasResponseText<T>(text: string): ApiResponse<T> {
  const cleanText = stripJsonHijackPrefix(text);
  try {
    return JSON.parse(cleanText) as ApiResponse<T>;
  } catch {
    throw new Error(cleanText || "Invalid API response format");
  }
}

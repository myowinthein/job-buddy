declare module 'mammoth' {
  interface Result<T> {
    value: T;
    messages: Array<{ type: string; message: string }>;
  }
  type BrowserInput = { arrayBuffer: ArrayBuffer };
  function extractRawText(input: BrowserInput): Promise<Result<string>>;
}

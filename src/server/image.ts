// A picture the office serves from a worker's checkout or the project's docs: its bytes and type, or
// why there's none (an HTTP status and the reason).
export type ImageResult = { type: string; body: Buffer } | { status: number; error: string };
